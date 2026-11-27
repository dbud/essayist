import type * as D1Client from "@effect/sql-d1/D1Client";
import { Cause, DateTime, Duration, Effect, Layer, Option } from "effect";
import { SqlModel, SqlSchema } from "effect/sql";
import { SqlClient } from "effect/sql/SqlClient";

import { AuthStore } from "./service.ts";
import { type SessionTokens, AuthRefreshToken, AuthSession } from "./types.ts";

// Idle session lifetime; re-applied at every token refresh.
const SESSION_TTL = Duration.days(90);

export function layerAuthD1(client: D1Client.D1Client & SqlClient): Layer.Layer<AuthStore> {
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
      ): Effect.Effect<void> =>
        Effect.gen(function* () {
          const expiresAt = DateTime.addDuration(yield* DateTime.now, SESSION_TTL);
          yield* Effect.orDie(sessions.insertVoid({ id, userId, expiresAt, tokens }));
        });

      const getSession = (id: string): Effect.Effect<Option.Option<AuthSession>> =>
        Effect.gen(function* () {
          const now = yield* DateTime.now;
          return yield* sessions.findById(id).pipe(
            Effect.map((session) =>
              DateTime.isGreaterThan(session.expiresAt, now) ? Option.some(session) : Option.none(),
            ),
            Effect.catchTag("NoSuchElementError", () => Effect.succeedNone),
            Effect.orDie,
          );
        });

      const updateSessionTokens = (id: string, tokens: SessionTokens): Effect.Effect<void> =>
        Effect.gen(function* () {
          const expiresAt = DateTime.addDuration(yield* DateTime.now, SESSION_TTL);
          yield* sessions.update({ id, expiresAt, tokens }).pipe(
            // a sign-out in another tab or device can delete the session while a google refresh is
            // in flight: updating the missing row is the no-op
            Effect.catchDefect((defect) =>
              Cause.isNoSuchElementError(defect) ? Effect.void : Effect.die(defect),
            ),
            Effect.orDie,
          );
        });

      const deleteSession = (id: string): Effect.Effect<void> => Effect.orDie(sessions.delete(id));

      const setRefreshToken = (userId: string, refreshToken: string): Effect.Effect<void> =>
        Effect.gen(function* () {
          const updatedAt = yield* DateTime.now;
          yield* Effect.orDie(upsertRefreshTokenRow({ userId, refreshToken, updatedAt }));
        });

      const getRefreshToken = (userId: string): Effect.Effect<Option.Option<string>> =>
        refreshTokens.findById(userId).pipe(
          Effect.map((row) => Option.some(row.refreshToken)),
          Effect.catchTag("NoSuchElementError", () => Effect.succeed(Option.none())),
          Effect.orDie,
        );

      const deleteRefreshToken = (userId: string): Effect.Effect<void> =>
        Effect.orDie(refreshTokens.delete(userId));

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
    }).pipe(Effect.provideService(SqlClient, client), Effect.orDie),
  );
}
