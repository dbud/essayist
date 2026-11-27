import type * as D1Client from "@effect/sql-d1/D1Client";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import { SqlSchema } from "effect/sql";

import { FileMissingError } from "#/files/d1/types.ts";
import { Ids } from "#/idsRef.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewRunActiveError, ReviewRunMissingError, ReviewRuns } from "./service.ts";
import { ReviewRun, ReviewRunStatus } from "./types.ts";

export function layerReviewRunsD1(client: D1Client.D1Client): Layer.Layer<ReviewRuns> {
  const inWorkspace = (wsId: string) =>
    client`fileId IN (SELECT id FROM files WHERE wsId = ${wsId})`;
  const onVersion = (versionId: string | undefined) =>
    versionId === undefined ? client`` : client` AND versionId = ${versionId}`;

  // inserts nothing when the file is deleted, in another workspace, or already has a running run
  const insertRun = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      fileId: Schema.String,
      versionId: Schema.String,
      reviewPassId: Schema.String,
      startedAt: Schema.DateTimeUtcFromString,
    }),
    Result: ReviewRun,
    execute: ({ wsId, runId, fileId, versionId, reviewPassId, startedAt }) =>
      client`INSERT INTO review_runs (id, fileId, versionId, reviewPassId, status, startedAt)
        SELECT ${runId}, ${fileId}, ${versionId}, ${reviewPassId}, 'running', ${startedAt}
        WHERE EXISTS (SELECT 1 FROM file_versions v JOIN files f ON f.id = v.fileId
          WHERE v.id = ${versionId} AND v.fileId = ${fileId}
            AND f.wsId = ${wsId} AND f.deletedAt IS NULL)
        ON CONFLICT DO NOTHING
        RETURNING *`,
  });

  const findRun = SqlSchema.findOne({
    Request: Schema.Struct({ wsId: Schema.String, runId: Schema.String }),
    Result: ReviewRun,
    execute: ({ wsId, runId }) =>
      client`SELECT * FROM review_runs WHERE id = ${runId} AND ${inWorkspace(wsId)}`,
  });

  const findActiveRun = SqlSchema.findOneOption({
    Request: Schema.Struct({ fileId: Schema.String }),
    Result: Schema.Struct({ id: Schema.String, versionId: Schema.String }),
    execute: ({ fileId }) =>
      client`SELECT id, versionId FROM review_runs WHERE fileId = ${fileId} AND status = 'running'`,
  });

  const findRuns = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String, fileId: Schema.optional(Schema.String) }),
    Result: ReviewRun,
    execute: ({ wsId, fileId }) =>
      client`SELECT * FROM review_runs WHERE ${inWorkspace(wsId)}
        ${fileId === undefined ? client`` : client` AND fileId = ${fileId}`}
        ORDER BY startedAt DESC, rowid DESC`,
  });

  const settleRun = SqlSchema.findOne({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      status: ReviewRunStatus,
      at: Schema.DateTimeUtcFromString,
      summary: Schema.NullOr(Schema.String),
      error: Schema.NullOr(Schema.String),
    }),
    Result: ReviewRun,
    execute: ({ wsId, runId, status, at, summary, error }) =>
      client`UPDATE review_runs
        SET status = ${status}, completedAt = ${at}, summary = ${summary}, error = ${error},
          leaseOwner = NULL, heartbeatAt = NULL
        WHERE id = ${runId} AND ${inWorkspace(wsId)}
        RETURNING *`,
  });

  const claimLease = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      owner: Schema.String,
      at: Schema.DateTimeUtcFromString,
      staleBefore: Schema.DateTimeUtcFromString,
    }),
    Result: ReviewRun,
    execute: ({ wsId, runId, owner, at, staleBefore }) =>
      client`UPDATE review_runs SET leaseOwner = ${owner}, heartbeatAt = ${at}
        WHERE id = ${runId} AND ${inWorkspace(wsId)} AND status = 'running'
          AND (leaseOwner IS NULL OR leaseOwner = ${owner} OR heartbeatAt < ${staleBefore})
        RETURNING *`,
  });

  const renewLease = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      runId: Schema.String,
      owner: Schema.String,
      at: Schema.DateTimeUtcFromString,
    }),
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ wsId, runId, owner, at }) =>
      client`UPDATE review_runs SET heartbeatAt = ${at}
        WHERE id = ${runId} AND ${inWorkspace(wsId)} AND leaseOwner = ${owner}
        RETURNING id`,
  });

  const deleteSettledRun = SqlSchema.findOneOption({
    Request: Schema.Struct({ wsId: Schema.String, runId: Schema.String }),
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ wsId, runId }) =>
      client`DELETE FROM review_runs
        WHERE id = ${runId} AND ${inWorkspace(wsId)} AND status <> 'running'
        RETURNING id`,
  });

  // deletes nothing while a run in scope is running
  const deleteFileRuns = SqlSchema.findAll({
    Request: Schema.Struct({
      wsId: Schema.String,
      fileId: Schema.String,
      versionId: Schema.optional(Schema.String),
    }),
    Result: Schema.Struct({ id: Schema.String }),
    execute: ({ wsId, fileId, versionId }) =>
      client`DELETE FROM review_runs
        WHERE fileId = ${fileId} AND ${inWorkspace(wsId)} ${onVersion(versionId)}
          AND NOT EXISTS (SELECT 1 FROM review_runs
            WHERE fileId = ${fileId} AND status = 'running' ${onVersion(versionId)})
        RETURNING id`,
  });

  const missing = (runId: string) => () => Effect.fail(new ReviewRunMissingError({ runId }));

  const getRun = (runId: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        findRun({ wsId, runId }),
        { NoSuchElementError: missing(runId) },
        Effect.die,
      );
    });

  const createRun = (input: { fileId: string; versionId: string; reviewPassId: string }) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const ids = yield* Ids;
      const created = yield* Effect.orDie(
        insertRun({ ...input, wsId, runId: ids.next(), startedAt: yield* DateTime.now }),
      );
      if (Option.isSome(created)) return created.value;
      const active = yield* Effect.orDie(findActiveRun(input));
      if (Option.isNone(active)) return yield* Effect.fail(new FileMissingError(input));
      return yield* Effect.fail(new ReviewRunActiveError({ runId: active.value.id }));
    });

  const listRuns = (fileId?: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.orDie(findRuns({ wsId, fileId }));
    });

  const settle = (
    runId: string,
    status: ReviewRunStatus,
    ended: { summary?: string; error?: string },
  ) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      return yield* Effect.catchTags(
        settleRun({
          wsId,
          runId,
          status,
          at: yield* DateTime.now,
          summary: ended.summary ?? null,
          error: ended.error ?? null,
        }),
        { NoSuchElementError: missing(runId) },
        Effect.die,
      );
    });

  const completeRun = (runId: string, summary: string) => settle(runId, "completed", { summary });

  const failRun = (runId: string, error: string) => settle(runId, "failed", { error });

  const claimRun = (runId: string, { owner, staleMs }: { owner: string; staleMs: number }) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const at = yield* DateTime.now;
      const staleBefore = DateTime.subtract(at, { milliseconds: staleMs });
      return yield* Effect.orDie(claimLease({ wsId, runId, owner, at, staleBefore }));
    });

  const heartbeatRun = (runId: string, owner: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const renewed = yield* Effect.orDie(
        renewLease({ wsId, runId, owner, at: yield* DateTime.now }),
      );
      return Option.isSome(renewed);
    });

  const deleteRun = (runId: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const deleted = yield* Effect.orDie(deleteSettledRun({ wsId, runId }));
      if (Option.isSome(deleted)) return;
      yield* getRun(runId);
      return yield* Effect.fail(new ReviewRunActiveError({ runId }));
    });

  const deleteRuns = (fileId: string, versionId?: string) =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const deleted = yield* Effect.orDie(deleteFileRuns({ wsId, fileId, versionId }));
      if (deleted.length > 0) return deleted.length;
      const active = yield* Effect.orDie(findActiveRun({ fileId }));
      if (Option.isNone(active)) return 0;
      if (versionId !== undefined && active.value.versionId !== versionId) return 0;
      return yield* Effect.fail(new ReviewRunActiveError({ runId: active.value.id }));
    });

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
      deleteRun,
      deleteRuns,
    }),
  );
}
