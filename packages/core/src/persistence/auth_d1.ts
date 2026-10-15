/**
 * D1 transport of the {@linkcode AuthStore} service: dedicated auth
 * tables, no kv encoding. Expiry is evaluated on read, so revocation
 * is immediate: D1 is a single strongly consistent store. The session
 * TTL is re-applied at every token refresh. Time is read from the
 * Clock service, so TTL behavior is testable.
 */

import type * as D1Client from "@effect/sql-d1/D1Client";
import { Clock, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";
import { AuthStore } from "#/auth/service.ts";
import type { Session, SessionTokens } from "#/auth/types.ts";
import { PersistenceError } from "./service.ts";

// Idle session lifetime; re-applied at every token refresh.
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** The tokens document, stored JSON-encoded in the tokens column. */
const TokensSchema = Schema.Struct({
  accessToken: Schema.NonEmptyString,
  tokenType: Schema.UndefinedOr(Schema.String),
  expiresIn: Schema.UndefinedOr(Schema.Number),
  refreshToken: Schema.UndefinedOr(Schema.NonEmptyString),
  expiresAt: Schema.Number,
});

const TokensFromJson = Schema.fromJsonString(TokensSchema);

const SessionRowSchema = Schema.Struct({
  id: Schema.String,
  user_id: Schema.String,
  created_at: Schema.Int,
  expires_at: Schema.Int,
  tokens: Schema.NullOr(TokensFromJson),
});
type SessionRow = typeof SessionRowSchema.Type;

// A plain rowid table: rows exceed the size at which WITHOUT ROWID
// is recommended.
const sessionRowOf = (row: SessionRow): Session => ({
  id: row.id,
  userId: row.user_id,
  tokens: row.tokens ?? undefined,
});

const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function layerAuthD1(
  client: D1Client.D1Client,
): Layer.Layer<AuthStore, PersistenceError> {
  const ensureSchema = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      client.batch([
        client`CREATE TABLE IF NOT EXISTS auth_session (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          tokens TEXT
        )`,
        client`CREATE TABLE IF NOT EXISTS auth_refresh_token (
          user_id TEXT PRIMARY KEY NOT NULL,
          refresh_token TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        ) WITHOUT ROWID`,
        client`CREATE INDEX IF NOT EXISTS auth_session_expiry
          ON auth_session (expires_at)`,
      ]),
  });

  const findSessionRow = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: SessionRowSchema,
    execute: (id) =>
      client`SELECT id, user_id, created_at, expires_at, tokens
        FROM auth_session WHERE id = ${id}`,
  });

  const findRefreshToken = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({ refresh_token: Schema.String }),
    execute: (userId) =>
      client`SELECT refresh_token FROM auth_refresh_token
        WHERE user_id = ${userId}`,
  });

  const insertSession = SqlSchema.void({
    Request: Schema.Struct({
      id: Schema.String,
      userId: Schema.String,
      createdAt: Schema.Number,
      expiresAt: Schema.Number,
      tokens: Schema.UndefinedOr(TokensFromJson),
    }),
    execute: (request) =>
      client`INSERT INTO auth_session ${client.insert([
        {
          id: request.id,
          user_id: request.userId,
          created_at: request.createdAt,
          expires_at: request.expiresAt,
          tokens: request.tokens ?? null,
        },
      ])}`,
  });

  const updateSessionRow = SqlSchema.void({
    Request: Schema.Struct({
      id: Schema.String,
      tokens: TokensFromJson,
      expiresAt: Schema.Number,
    }),
    execute: (request) =>
      client`UPDATE auth_session
        SET tokens = ${request.tokens}, expires_at = ${request.expiresAt}
        WHERE id = ${request.id}`,
  });

  const upsertRefreshToken = SqlSchema.void({
    Request: Schema.Struct({
      userId: Schema.String,
      refreshToken: Schema.String,
      updatedAt: Schema.Number,
    }),
    execute: (request) =>
      client`INSERT INTO auth_refresh_token ${client.insert([
        {
          user_id: request.userId,
          refresh_token: request.refreshToken,
          updated_at: request.updatedAt,
        },
      ])} ON CONFLICT (user_id) DO UPDATE SET
        refresh_token = excluded.refresh_token,
        updated_at = excluded.updated_at`,
  });

  const deleteSessionRow = SqlSchema.void({
    Request: Schema.String,
    execute: (id) => client`DELETE FROM auth_session WHERE id = ${id}`,
  });

  const createSession = (
    id: string,
    userId: string,
    tokens?: SessionTokens,
  ): Effect.Effect<void, PersistenceError> =>
    Effect.mapError(
      Effect.flatMap(Clock.currentTimeMillis, (now) =>
        insertSession({
          id: id,
          userId: userId,
          createdAt: now,
          expiresAt: now + SESSION_TTL_MS,
          tokens: tokens,
        }),
      ),
      backendFault,
    );

  const getSession = (
    id: string,
  ): Effect.Effect<Session | undefined, PersistenceError> =>
    Effect.gen(function* () {
      const option = yield* findSessionRow(id);
      if (Option.isNone(option)) return undefined;
      const row = option.value;
      const now = yield* Clock.currentTimeMillis;
      return row.expires_at > now ? sessionRowOf(row) : undefined;
    }).pipe(Effect.mapError(backendFault));

  const updateSessionTokens = (
    id: string,
    tokens: SessionTokens,
  ): Effect.Effect<void, PersistenceError> =>
    Effect.mapError(
      Effect.flatMap(Clock.currentTimeMillis, (now) =>
        updateSessionRow({
          id: id,
          tokens: tokens,
          expiresAt: now + SESSION_TTL_MS,
        }),
      ),
      backendFault,
    );

  const deleteSession = (id: string): Effect.Effect<void, PersistenceError> =>
    Effect.mapError(deleteSessionRow(id), backendFault);

  const setRefreshToken = (
    userId: string,
    refreshToken: string,
  ): Effect.Effect<void, PersistenceError> =>
    Effect.mapError(
      Effect.flatMap(Clock.currentTimeMillis, (now) =>
        upsertRefreshToken({
          userId: userId,
          refreshToken: refreshToken,
          updatedAt: now,
        }),
      ),
      backendFault,
    );

  const getRefreshToken = (
    userId: string,
  ): Effect.Effect<string | undefined, PersistenceError> =>
    Effect.mapError(
      Effect.map(findRefreshToken(userId), (option) =>
        Option.isNone(option) ? undefined : option.value.refresh_token,
      ),
      backendFault,
    );

  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Effect.mapError(ensureSchema(undefined), backendFault);
      return Layer.succeed(
        AuthStore,
        AuthStore.of({
          createSession,
          getSession,
          updateSessionTokens,
          deleteSession,
          setRefreshToken,
          getRefreshToken,
        }),
      );
    }),
  );
}
