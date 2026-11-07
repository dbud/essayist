import type * as D1Client from "@effect/sql-d1/D1Client";
import { Clock, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { Ids } from "#/idsRef.ts";
import type { ClaimOptions } from "#/persistence/mod.ts";
import { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewRunMissingError, ReviewRuns } from "./service.ts";
import { ReviewRun, ReviewRunStatus } from "./types.ts";

const backendFault = (cause: unknown) => new PersistenceError({ cause });

export function layerReviewRunsD1(
  client: D1Client.D1Client,
): Layer.Layer<ReviewRuns, PersistenceError> {
  const ensureSchema = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      client.batch([
        client`CREATE TABLE IF NOT EXISTS review_runs (
          id TEXT NOT NULL,
          wsId TEXT NOT NULL,
          path TEXT NOT NULL,
          reviewPassId TEXT NOT NULL,
          versionId TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
          startedAt INTEGER NOT NULL,
          completedAt INTEGER,
          error TEXT,
          summary TEXT,
          leaseOwner TEXT,
          heartbeatAt INTEGER,
          PRIMARY KEY (wsId, id)
        ) WITHOUT ROWID`,
        client`CREATE INDEX IF NOT EXISTS review_runs_started
          ON review_runs (wsId, startedAt DESC)`,
        // a global sweep for runs in progress, for the stale-run janitor
        client`CREATE INDEX IF NOT EXISTS review_runs_stale ON review_runs (heartbeatAt)
          WHERE status = 'running'`,
      ]),
  });

  const insertRun = SqlSchema.void({
    Request: Schema.Struct({
      id: Schema.String,
      wsId: Schema.String,
      path: Schema.String,
      reviewPassId: Schema.String,
      versionId: Schema.String,
      status: ReviewRunStatus,
      startedAt: Schema.Number,
    }),
    execute: (row) => client`INSERT INTO review_runs ${client.insert([row])}`,
  });

  const findRunRow = SqlSchema.findOne({
    Request: Schema.Struct({ wsId: Schema.String, id: Schema.String }),
    Result: ReviewRun,
    execute: ({ wsId, id }) =>
      client`SELECT * FROM review_runs
        WHERE wsId = ${wsId} AND id = ${id}`,
  });

  const findRunRows = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String, path: Schema.NullOr(Schema.String) }),
    Result: ReviewRun,
    execute: ({ wsId, path }) =>
      path === null
        ? client`SELECT * FROM review_runs
          WHERE wsId = ${wsId} ORDER BY startedAt DESC`
        : client`SELECT * FROM review_runs
          WHERE wsId = ${wsId} AND path = ${path} ORDER BY startedAt DESC`,
  });

  const settleRun = SqlSchema.findOne({
    Request: Schema.Struct({
      wsId: Schema.String,
      id: Schema.String,
      status: ReviewRunStatus,
      completedAt: Schema.Number,
      summary: Schema.NullOr(Schema.String),
      error: Schema.NullOr(Schema.String),
    }),
    Result: ReviewRun,
    execute: ({ wsId, id, status, completedAt, summary, error }) =>
      client`UPDATE review_runs
        SET status = ${status}, completedAt = ${completedAt},
          summary = ${summary}, error = ${error},
          leaseOwner = NULL, heartbeatAt = NULL
        WHERE wsId = ${wsId} AND id = ${id}
        RETURNING *`,
  });

  // takes the lease when it is free, ours, or stale; a lost race updates no row
  const claimRunRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      id: Schema.String,
      owner: Schema.String,
      heartbeatAtLeast: Schema.Number,
      at: Schema.Number,
    }),
    Result: ReviewRun,
    execute: ({ wsId, id, owner, heartbeatAtLeast, at }) =>
      client`UPDATE review_runs
        SET leaseOwner = ${owner}, heartbeatAt = ${at}
        WHERE wsId = ${wsId} AND id = ${id}
          AND (leaseOwner IS NULL OR leaseOwner = ${owner}
            OR COALESCE(heartbeatAt, 0) < ${heartbeatAtLeast})
        RETURNING *`,
  });

  const renewHeartbeat = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      id: Schema.String,
      owner: Schema.String,
      at: Schema.Number,
    }),
    Result: ReviewRun,
    execute: ({ wsId, id, owner, at }) =>
      client`UPDATE review_runs
        SET heartbeatAt = ${at}
        WHERE wsId = ${wsId} AND id = ${id} AND leaseOwner = ${owner}
        RETURNING *`,
  });

  const createRun = ({
    path,
    versionId,
    reviewPassId,
    startedAt,
  }: {
    path: string;
    versionId: string;
    reviewPassId: string;
    startedAt?: number;
  }): Effect.Effect<ReviewRun, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const ids = yield* Ids;
      const run = new ReviewRun({
        id: ids.next(),
        wsId,
        path,
        reviewPassId,
        versionId,
        status: "running",
        startedAt: startedAt ?? (yield* Clock.currentTimeMillis),
        completedAt: Option.none(),
        error: Option.none(),
        summary: Option.none(),
        leaseOwner: Option.none(),
        heartbeatAt: Option.none(),
      });
      yield* Effect.mapError(insertRun(run), backendFault);
      return run;
    });

  const getRun = (
    id: string,
  ): Effect.Effect<ReviewRun, PersistenceError | ReviewRunMissingError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        findRunRow({ wsId, id }),
        { NoSuchElementError: () => Effect.fail(new ReviewRunMissingError({ id })) },
        (e) => Effect.fail(backendFault(e)),
      );
    });

  const listRuns = (
    path?: string,
  ): Effect.Effect<ReadonlyArray<ReviewRun>, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.mapError(findRunRows({ wsId, path: path ?? null }), backendFault);
    });

  const endRun = (
    id: string,
    status: ReviewRunStatus,
    extra: { summary?: string; error?: string },
  ): Effect.Effect<ReviewRun, PersistenceError | ReviewRunMissingError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        settleRun({
          wsId,
          id,
          status,
          completedAt: yield* Clock.currentTimeMillis,
          summary: extra.summary ?? null,
          error: extra.error ?? null,
        }),
        { NoSuchElementError: () => Effect.fail(new ReviewRunMissingError({ id })) },
        (e) => Effect.fail(backendFault(e)),
      );
    });

  const completeRun = (id: string, summary: string) => endRun(id, "completed", { summary });

  const failRun = (id: string, error: string) => endRun(id, "failed", { error });

  const claimRun = (
    id: string,
    { owner, heartbeatAtLeast }: ClaimOptions,
  ): Effect.Effect<Option.Option<ReviewRun>, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.mapError(
        claimRunRow({
          wsId,
          id,
          owner,
          heartbeatAtLeast,
          at: yield* Clock.currentTimeMillis,
        }),
        backendFault,
      );
    });

  const heartbeatRun = (
    id: string,
    owner: string,
  ): Effect.Effect<boolean, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const renewed = yield* Effect.mapError(
        renewHeartbeat({ wsId, id, owner, at: yield* Clock.currentTimeMillis }),
        backendFault,
      );
      return Option.isSome(renewed);
    });

  return Layer.unwrap(
    Effect.gen(function* () {
      yield* Effect.mapError(ensureSchema(), backendFault);
      return Layer.succeed(
        ReviewRuns,
        ReviewRuns.of({
          createRun,
          getRun,
          listRuns,
          completeRun,
          failRun,
          claimRun,
          heartbeatRun,
        }),
      );
    }),
  );
}
