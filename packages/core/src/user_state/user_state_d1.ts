import type * as D1Client from "@effect/sql-d1/D1Client";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { UserState } from "./service.ts";

export function layerUserStateD1(client: D1Client.D1Client): Layer.Layer<UserState> {
  const findLastOpened = SqlSchema.findOneOption({
    Request: Schema.Struct({ userId: Schema.String }),
    Result: Schema.Struct({ wsId: Schema.String }),
    execute: ({ userId }) =>
      client`SELECT s.wsId FROM user_workspace_state s JOIN workspaces w ON w.id = s.wsId
        WHERE s.userId = ${userId} AND w.deletedAt IS NULL
        ORDER BY s.openedAt DESC
        LIMIT 1`,
  });

  const upsertOpened = SqlSchema.void({
    Request: Schema.Struct({
      userId: Schema.String,
      wsId: Schema.String,
      at: Schema.DateTimeUtcFromString,
    }),
    execute: ({ userId, wsId, at }) =>
      client`INSERT INTO user_workspace_state (userId, wsId, openedAt)
        VALUES (${userId}, ${wsId}, ${at})
        ON CONFLICT (userId, wsId) DO UPDATE SET openedAt = excluded.openedAt`,
  });

  const findSelectedFile = SqlSchema.findOneOption({
    Request: Schema.Struct({ userId: Schema.String, wsId: Schema.String }),
    Result: Schema.Struct({ path: Schema.String }),
    execute: ({ userId, wsId }) =>
      client`SELECT f.path FROM user_workspace_state s JOIN files f ON f.id = s.selectedFileId
        WHERE s.userId = ${userId} AND s.wsId = ${wsId} AND f.deletedAt IS NULL`,
  });

  // selecting a file in a workspace not opened before opens it
  const upsertSelectedFile = SqlSchema.void({
    Request: Schema.Struct({
      userId: Schema.String,
      wsId: Schema.String,
      path: Schema.String,
      at: Schema.DateTimeUtcFromString,
    }),
    execute: ({ userId, wsId, path, at }) =>
      client`INSERT INTO user_workspace_state (userId, wsId, selectedFileId, openedAt)
        SELECT ${userId}, ${wsId}, id, ${at} FROM files
        WHERE wsId = ${wsId} AND path = ${path} AND deletedAt IS NULL
        ON CONFLICT (userId, wsId) DO UPDATE SET selectedFileId = excluded.selectedFileId`,
  });

  const getSelectedWorkspace = (userId: string) =>
    Effect.map(
      Effect.orDie(findLastOpened({ userId })),
      Option.map(({ wsId }) => wsId),
    );

  const setSelectedWorkspace = (userId: string, wsId: string) =>
    Effect.gen(function* () {
      yield* Effect.orDie(upsertOpened({ userId, wsId, at: yield* DateTime.now }));
    });

  const getSelectedFile = (userId: string, wsId: string) =>
    Effect.map(
      Effect.orDie(findSelectedFile({ userId, wsId })),
      Option.map(({ path }) => path),
    );

  const setSelectedFile = (userId: string, wsId: string, path: string) =>
    Effect.gen(function* () {
      yield* Effect.orDie(upsertSelectedFile({ userId, wsId, path, at: yield* DateTime.now }));
    });

  return Layer.succeed(
    UserState,
    UserState.of({ getSelectedWorkspace, setSelectedWorkspace, getSelectedFile, setSelectedFile }),
  );
}
