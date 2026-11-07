import type * as D1Client from "@effect/sql-d1/D1Client";
import { Clock, Effect, Layer, Option, Schema, SchemaGetter } from "effect";
import { SqlSchema } from "effect/sql";

import { Ids } from "#/idsRef.ts";
import type { ClaimOptions } from "#/persistence/mod.ts";
import { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewRuns } from "./service.ts";
import { ReviewRun, ReviewRunStatus } from "./types.ts";

const backendFault = (cause: unknown) => new PersistenceError({ cause });

const RUN_COLUMNS =
  "id, ws_id, path, review_pass_id, version_id, status, started_at, completed_at, error, summary, lease_owner, lease_heartbeat_at";

const COLUMN_NAMES = {
  wsId: "ws_id",
  reviewPassId: "review_pass_id",
  versionId: "version_id",
  startedAt: "started_at",
  completedAt: "completed_at",
  leaseOwner: "lease_owner",
  heartbeatAt: "lease_heartbeat_at",
};

const RunRow = ReviewRun.pipe(
  Schema.fieldsAssign({
    completedAt: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    error: Schema.optionalKey(Schema.NullOr(Schema.String)),
    summary: Schema.optionalKey(Schema.NullOr(Schema.String)),
    leaseOwner: Schema.optionalKey(Schema.NullOr(Schema.String)),
    heartbeatAt: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  }),
  Schema.encodeKeys(COLUMN_NAMES),
);

/**
 * The record shape a row reads back into: the optional fields tolerate the explicit-undefined
 * values the null-to-absent restore produces.
 */
const RunRecord = ReviewRun.pipe(
  Schema.fieldsAssign({
    completedAt: Schema.optional(Schema.Number),
    error: Schema.optional(Schema.String),
    summary: Schema.optional(Schema.String),
    leaseOwner: Schema.optional(Schema.String),
    heartbeatAt: Schema.optional(Schema.Number),
  }),
);

const RunFromRow = RunRow.pipe(
  Schema.decodeTo(RunRecord, {
    decode: SchemaGetter.transform((row: typeof RunRow.Type) => ({
      ...row,
      completedAt: row.completedAt ?? undefined,
      error: row.error ?? undefined,
      summary: row.summary ?? undefined,
      leaseOwner: row.leaseOwner ?? undefined,
      heartbeatAt: row.heartbeatAt ?? undefined,
    })),
    encode: SchemaGetter.forbiddenEncoding,
  }),
);

export function layerReviewRunsD1(
  client: D1Client.D1Client,
): Layer.Layer<ReviewRuns, PersistenceError> {
  const ensureSchema = SqlSchema.void({
    Request: Schema.Void,
    execute: () =>
      client.batch([
        client`CREATE TABLE IF NOT EXISTS review_runs (
          ws_id TEXT NOT NULL,
          id TEXT NOT NULL,
          path TEXT NOT NULL,
          review_pass_id TEXT NOT NULL,
          version_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
          started_at INTEGER NOT NULL,
          completed_at INTEGER,
          error TEXT,
          summary TEXT,
          lease_owner TEXT,
          lease_heartbeat_at INTEGER,
          PRIMARY KEY (ws_id, id)
        ) WITHOUT ROWID`,
        client`CREATE INDEX IF NOT EXISTS review_runs_started
          ON review_runs (ws_id, started_at DESC)`,
        // A global sweep for runs in progress, for the stale-run janitor.
        client`CREATE INDEX IF NOT EXISTS review_runs_stale ON review_runs (lease_heartbeat_at)
          WHERE status = 'running'`,
      ]),
  });

  const insertRun = SqlSchema.void({
    Request: RunRow,
    execute: (row) => client`INSERT INTO review_runs ${client.insert([row])}`,
  });

  const findRunRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ wsId: Schema.String, id: Schema.String }),
    Result: RunFromRow,
    execute: ({ wsId, id }) =>
      client`SELECT ${client.literal(RUN_COLUMNS)} FROM review_runs
        WHERE ws_id = ${wsId} AND id = ${id}`,
  });

  const findRunRows = SqlSchema.findAll({
    Request: Schema.Struct({ wsId: Schema.String, path: Schema.NullOr(Schema.String) }),
    Result: RunFromRow,
    execute: ({ wsId, path }) =>
      path === null
        ? client`SELECT ${client.literal(RUN_COLUMNS)} FROM review_runs
          WHERE ws_id = ${wsId} ORDER BY started_at DESC`
        : client`SELECT ${client.literal(RUN_COLUMNS)} FROM review_runs
          WHERE ws_id = ${wsId} AND path = ${path} ORDER BY started_at DESC`,
  });

  const settleRun = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      id: Schema.String,
      status: ReviewRunStatus,
      completedAt: Schema.Number,
      summary: Schema.NullOr(Schema.String),
      error: Schema.NullOr(Schema.String),
    }),
    Result: RunFromRow,
    execute: ({ wsId, id, status, completedAt, summary, error }) =>
      client`UPDATE review_runs
        SET status = ${status}, completed_at = ${completedAt},
          summary = ${summary}, error = ${error},
          lease_owner = NULL, lease_heartbeat_at = NULL
        WHERE ws_id = ${wsId} AND id = ${id}
        RETURNING ${client.literal(RUN_COLUMNS)}`,
  });

  const claimRunRow = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      id: Schema.String,
      owner: Schema.String,
      heartbeatAtLeast: Schema.Number,
      at: Schema.Number,
    }),
    Result: RunFromRow,
    execute: ({ wsId, id, owner, heartbeatAtLeast, at }) =>
      client`UPDATE review_runs
        SET lease_owner = ${owner}, lease_heartbeat_at = ${at}
        WHERE ws_id = ${wsId} AND id = ${id}
          AND (lease_owner IS NULL OR lease_owner = ${owner}
            OR COALESCE(lease_heartbeat_at, 0) < ${heartbeatAtLeast})
        RETURNING ${client.literal(RUN_COLUMNS)}`,
  });

  const renewHeartbeat = SqlSchema.findOneOption({
    Request: Schema.Struct({
      wsId: Schema.String,
      id: Schema.String,
      owner: Schema.String,
      at: Schema.Number,
    }),
    Result: RunFromRow,
    execute: ({ wsId, id, owner, at }) =>
      client`UPDATE review_runs
        SET lease_heartbeat_at = ${at}
        WHERE ws_id = ${wsId} AND id = ${id} AND lease_owner = ${owner}
        RETURNING ${client.literal(RUN_COLUMNS)}`,
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
      const run: ReviewRun = {
        id: ids.next(),
        wsId,
        path,
        reviewPassId,
        status: "running",
        startedAt: startedAt ?? (yield* Clock.currentTimeMillis),
        versionId,
      };
      yield* Effect.mapError(insertRun(run), backendFault);
      return run;
    });

  const getRun = (
    id: string,
  ): Effect.Effect<ReviewRun | undefined, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const option = yield* Effect.mapError(findRunRow({ wsId, id }), backendFault);
      return Option.isNone(option) ? undefined : option.value;
    });

  const listRuns = (path?: string): Effect.Effect<ReviewRun[], PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const rows = yield* Effect.mapError(
        findRunRows({ wsId: wsId, path: path ?? null }),
        backendFault,
      );
      return rows;
    });

  const endRun = (
    id: string,
    status: ReviewRunStatus,
    extra: { summary?: string; error?: string },
  ): Effect.Effect<ReviewRun | undefined, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const option = yield* Effect.mapError(
        settleRun({
          wsId,
          id,
          status,
          completedAt: yield* Clock.currentTimeMillis,
          summary: extra.summary ?? null,
          error: extra.error ?? null,
        }),
        backendFault,
      );
      return Option.isNone(option) ? undefined : option.value;
    });

  const completeRun = (id: string, summary: string) => endRun(id, "completed", { summary });

  const failRun = (id: string, error: string) => endRun(id, "failed", { error });

  const claimRun = (
    id: string,
    { owner, heartbeatAtLeast }: ClaimOptions,
  ): Effect.Effect<ReviewRun | undefined, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const option = yield* Effect.mapError(
        claimRunRow({
          wsId,
          id,
          owner,
          heartbeatAtLeast,
          at: yield* Clock.currentTimeMillis,
        }),
        backendFault,
      );
      return Option.isNone(option) ? undefined : option.value;
    });

  const heartbeatRun = (
    id: string,
    owner: string,
  ): Effect.Effect<boolean, PersistenceError, WorkspaceId> =>
    Effect.gen(function* () {
      const { wsId } = yield* WorkspaceId;
      const option = yield* Effect.mapError(
        renewHeartbeat({
          wsId,
          id,
          owner,
          at: yield* Clock.currentTimeMillis,
        }),
        backendFault,
      );
      return Option.isSome(option);
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
