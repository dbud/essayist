/**
 * D1 transport of the {@linkcode AuthStore} service. Expiry is
 * filtered in the read query, so revocation is immediate; the TTL
 * re-applies at every token refresh.
 */

import type * as D1Client from "@effect/sql-d1/D1Client";
import { Clock, Effect, Layer, Option, Schema, SchemaGetter } from "effect";
import { SqlSchema } from "effect/sql";

import { PersistenceError } from "#/persistence/service.ts";

import { AuthStore } from "./service.ts";
import { Session, SessionTokens } from "./types.ts";

// Idle session lifetime; re-applied at every token refresh.
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const SessionRow = Session.pipe(
  Schema.fieldsAssign({
    expiresAt: Schema.Int,
    tokens: Schema.NullOr(Schema.fromJsonString(SessionTokens)),
  }),
  Schema.encodeKeys({ userId: "user_id", expiresAt: "expires_at" }),
);

const SessionFromRow = SessionRow.pipe(
  Schema.decodeTo(Session, {
    decode: SchemaGetter.transform((row: typeof SessionRow.Type) => ({
      id: row.id,
      userId: row.userId,
      tokens: row.tokens ?? undefined,
    })),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

const RefreshTokenRow = Schema.Struct({
  userId: Schema.String,
  refreshToken: Schema.NonEmptyString,
  updatedAt: Schema.Number,
}).pipe(
  Schema.encodeKeys({
    userId: "user_id",
    refreshToken: "refresh_token",
    updatedAt: "updated_at",
  }),
);

const RefreshTokenFromRow = RefreshTokenRow.pipe(
  Schema.decodeTo(Schema.NonEmptyString, {
    decode: SchemaGetter.transform((row: typeof RefreshTokenRow.Type) => row.refreshToken),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function layerAuthD1(client: D1Client.D1Client): Layer.Layer<AuthStore, PersistenceError> {
  // TODO -- this DDL batch runs on every isolate spin-up; consider a
  // schema version check to skip it when the schema already exists
  // (ESS-92)

  const ensureSchema = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      client.batch([
        client`CREATE TABLE IF NOT EXISTS auth_session (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          tokens TEXT
        )`,
        client`CREATE TABLE IF NOT EXISTS auth_refresh_token (
          user_id TEXT PRIMARY KEY NOT NULL,
          refresh_token TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        ) WITHOUT ROWID`,
        // TODO -- the expiry sweep (DELETE FROM auth_session WHERE
        // expires_at < now) will use this index; the sweep command does
        // not exist yet.
        client`CREATE INDEX IF NOT EXISTS auth_session_expiry
          ON auth_session (expires_at)`,
      ]),
  });

  const findSessionRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ id: Schema.String, now: Schema.Number }),
    Result: SessionFromRow,
    execute: ({ id, now }) =>
      client`SELECT id, user_id, expires_at, tokens FROM auth_session
        WHERE id = ${id} AND expires_at > ${now}`,
  });

  const findRefreshToken = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: RefreshTokenFromRow,
    execute: (userId) =>
      client`SELECT user_id, refresh_token, updated_at
        FROM auth_refresh_token WHERE user_id = ${userId}`,
  });

  const insertSession = SqlSchema.void({
    Request: SessionRow,
    execute: (session) => client`INSERT INTO auth_session ${client.insert([session])}`,
  });

  const updateSessionRow = SqlSchema.void({
    Request: SessionRow,
    execute: (session) =>
      client`UPDATE auth_session
        SET tokens = ${session.tokens}, expires_at = ${session.expires_at}
        WHERE id = ${session.id}`,
  });

  const upsertRefreshToken = SqlSchema.void({
    Request: RefreshTokenRow,
    execute: (refreshToken) =>
      client`INSERT INTO auth_refresh_token ${client.insert([refreshToken])}
        ON CONFLICT (user_id) DO UPDATE SET
          refresh_token = excluded.refresh_token,
          updated_at = excluded.updated_at`,
  });

  const deleteSessionRow = SqlSchema.void({
    Request: Schema.String,
    execute: (id) => client`DELETE FROM auth_session WHERE id = ${id}`,
  });

  const deleteRefreshTokenRow = SqlSchema.void({
    Request: Schema.String,
    execute: (userId) => client`DELETE FROM auth_refresh_token WHERE user_id = ${userId}`,
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
          expiresAt: now + SESSION_TTL_MS,
          tokens: tokens ?? null,
        }),
      ),
      backendFault,
    );

  // TODO -- getSession always fetches and decodes the google tokens
  // column, but the session middleware only needs the user id; only
  // the token refresh flow needs tokens. A tokens-free read variant
  // would lighten the hot path. (ESS-92)

  const getSession = (id: string): Effect.Effect<Session | undefined, PersistenceError> =>
    Effect.mapError(
      Effect.flatMap(Clock.currentTimeMillis, (now) =>
        Effect.map(findSessionRow({ id: id, now: now }), (option) =>
          Option.isNone(option) ? undefined : option.value,
        ),
      ),
      backendFault,
    );

  const updateSessionTokens = (
    id: string,
    userId: string,
    tokens: SessionTokens,
  ): Effect.Effect<void, PersistenceError> =>
    Effect.mapError(
      Effect.flatMap(Clock.currentTimeMillis, (now) =>
        updateSessionRow({
          id: id,
          userId: userId,
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

  const getRefreshToken = (userId: string): Effect.Effect<string | undefined, PersistenceError> =>
    Effect.mapError(Effect.map(findRefreshToken(userId), Option.getOrUndefined), backendFault);

  const deleteRefreshToken = (userId: string): Effect.Effect<void, PersistenceError> =>
    Effect.mapError(deleteRefreshTokenRow(userId), backendFault);

  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Effect.mapError(ensureSchema(), backendFault);
      return Layer.succeed(
        AuthStore,
        AuthStore.of({
          createSession,
          getSession,
          updateSessionTokens,
          deleteSession,
          setRefreshToken,
          getRefreshToken,
          deleteRefreshToken,
        }),
      );
    }),
  );
}
