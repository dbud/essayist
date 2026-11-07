import type * as D1Client from "@effect/sql-d1/D1Client";
import { Cause, Clock, Effect, Layer, Option, Schema } from "effect";
import { SqlModel, SqlSchema } from "effect/sql";
import { SqlClient } from "effect/sql/SqlClient";

import { PersistenceError } from "#/persistence/service.ts";

import { AuthStore } from "./service.ts";
import { type SessionTokens, AuthRefreshToken, AuthSession } from "./types.ts";

// Idle session lifetime; re-applied at every token refresh.
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function layerAuthD1(client: D1Client.D1Client): Layer.Layer<AuthStore, PersistenceError> {
  const ensureSchema = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      client.batch([
        client`CREATE TABLE IF NOT EXISTS auth_session (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          tokens TEXT
        )`,
        // for a future expiry sweep
        client`CREATE INDEX IF NOT EXISTS auth_session_expiry ON auth_session (expiresAt)`,
        client`CREATE TABLE IF NOT EXISTS auth_refresh_token (
          userId TEXT PRIMARY KEY NOT NULL,
          refreshToken TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        )`,
      ]),
  });

  const upsertRefreshTokenRow = SqlSchema.void({
    Request: AuthRefreshToken.insert,
    execute: ({ userId, refreshToken, updatedAt }) =>
      client`INSERT INTO auth_refresh_token ${client.insert([{ userId, refreshToken, updatedAt }])}
        ON CONFLICT (userId) DO UPDATE SET
          refreshToken = excluded.refreshToken,
          updatedAt = excluded.updatedAt`,
  });

  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Effect.mapError(ensureSchema(), backendFault);
      const sessions = yield* SqlModel.makeRepository(AuthSession, {
        tableName: "auth_session",
        spanPrefix: "AuthSession",
        idColumn: "id",
      });
      const refreshTokens = yield* SqlModel.makeRepository(AuthRefreshToken, {
        tableName: "auth_refresh_token",
        spanPrefix: "AuthRefreshToken",
        idColumn: "userId",
      });

      const createSession = (
        id: string,
        userId: string,
        tokens?: SessionTokens,
      ): Effect.Effect<void, PersistenceError> =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* Effect.mapError(
            sessions.insertVoid({ id, userId, expiresAt: now + SESSION_TTL_MS, tokens }),
            backendFault,
          );
        });

      // missing and expired sessions read as undefined
      const getSession = (id: string): Effect.Effect<AuthSession | undefined, PersistenceError> =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          return yield* sessions.findById(id).pipe(
            Effect.map((row) => (row.expiresAt > now ? row : undefined)),
            Effect.catchTag("NoSuchElementError", () => Effect.succeed(undefined)),
            Effect.mapError(backendFault),
          );
        });

      const updateSessionTokens = (
        id: string,
        tokens: SessionTokens,
      ): Effect.Effect<void, PersistenceError> =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          yield* sessions.update({ id, expiresAt: now + SESSION_TTL_MS, tokens }).pipe(
            // a sign-out in another tab or device can delete the session while a google refresh is
            // in flight: updating the missing row is the no-op
            Effect.catchDefect((defect) =>
              Cause.isNoSuchElementError(defect) ? Effect.void : Effect.die(defect),
            ),
            Effect.mapError(backendFault),
          );
        });

      const deleteSession = (id: string): Effect.Effect<void, PersistenceError> =>
        Effect.mapError(sessions.delete(id), backendFault);

      const setRefreshToken = (
        userId: string,
        refreshToken: string,
      ): Effect.Effect<void, PersistenceError> =>
        Effect.gen(function* () {
          const updatedAt = yield* Clock.currentTimeMillis;
          yield* Effect.mapError(
            upsertRefreshTokenRow({ userId, refreshToken, updatedAt }),
            backendFault,
          );
        });

      const getRefreshToken = (
        userId: string,
      ): Effect.Effect<Option.Option<string>, PersistenceError> =>
        refreshTokens.findById(userId).pipe(
          Effect.map((row) => Option.some(row.refreshToken)),
          Effect.catchTag("NoSuchElementError", () => Effect.succeed(Option.none())),
          Effect.mapError(backendFault),
        );

      const deleteRefreshToken = (userId: string): Effect.Effect<void, PersistenceError> =>
        Effect.mapError(refreshTokens.delete(userId), backendFault);

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
    }).pipe(Effect.provideService(SqlClient, client), Effect.mapError(backendFault)),
  );
}
