/**
 * Review runs as an Effect service: creation, reads, and listing for now;
 * claim, heartbeat, and end-state ops land alongside in later commits.
 *
 * Key layout:
 *   ["reviews", wsId, runId] -> ReviewRun
 */

import { sortBy } from "@std/collections";
import { Clock, Context, Effect, Layer, Result } from "effect";
import { Ids } from "#/ids.ts";
import {
  type ClaimOptions,
  ConcurrentModificationError,
  type Key,
  Persistence,
  type PersistenceError,
} from "#/persistence/mod.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";
import type { ReviewRun, ReviewRunStatus } from "./types.ts";

const REVIEWS = "reviews";

/** Strip the lease fields off a run. */
function stripLease(value: ReviewRun): ReviewRun {
  const { leaseOwner: _owner, heartbeatAt: _at, ...body } = value;
  return body;
}

export interface Interface {
  /** Create a run in the "running" state. */
  createRun(input: {
    path: string;
    reviewPassId: string;
    versionId?: string;
    startedAt?: number;
  }): Effect.Effect<
    ReviewRun,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /** Get a run, or undefined when absent. */
  getRun(
    id: string,
  ): Effect.Effect<ReviewRun | undefined, PersistenceError, WorkspaceId>;
  /** List runs for the workspace, newest first. Optionally filtered by file. */
  listRuns(
    path?: string,
  ): Effect.Effect<ReviewRun[], PersistenceError, WorkspaceId>;
  /** Complete a run with its final summary. Undefined when absent. */
  completeRun(
    id: string,
    summary: string,
  ): Effect.Effect<
    ReviewRun | undefined,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /** Fail a run with its error. Undefined when absent. */
  failRun(
    id: string,
    error: string,
  ): Effect.Effect<
    ReviewRun | undefined,
    PersistenceError | ConcurrentModificationError,
    WorkspaceId
  >;
  /**
   * Take the lease on a run, so only one owner works on it at a time.
   * Undefined when the run is gone, another owner holds a live lease, or a
   * concurrent claim won the race. Claiming as the current owner renews.
   */
  claimRun(
    id: string,
    options: ClaimOptions,
  ): Effect.Effect<ReviewRun | undefined, PersistenceError, WorkspaceId>;
  /**
   * Renew the lease on a run, only while it is leased to the given owner.
   * Unlike claim, this never takes a lease. False when the run is gone,
   * another owner holds the lease, or a concurrent write won the race.
   */
  heartbeatRun(
    id: string,
    owner: string,
  ): Effect.Effect<boolean, PersistenceError, WorkspaceId>;
}

export class ReviewRuns extends Context.Service<ReviewRuns, Interface>()(
  "@essayist/core/reviews/ReviewRuns",
) {
  /** Requires the {@linkcode Persistence} service; compose with
   * Persistence.layerKv at the composition root. The workspace scope comes
   * from the WorkspaceId tag at call time. */
  static readonly layerNoDeps: Layer.Layer<ReviewRuns, never, Persistence> =
    Layer.effect(
      ReviewRuns,
      Effect.gen(function* () {
        const persistence = yield* Persistence;

        const createRun = (input: {
          path: string;
          reviewPassId: string;
          versionId?: string;
          startedAt?: number;
        }): Effect.Effect<
          ReviewRun,
          PersistenceError | ConcurrentModificationError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const ids = yield* Ids;
            const id = ids.next();
            const run: ReviewRun = {
              id,
              wsId,
              path: input.path,
              reviewPassId: input.reviewPassId,
              status: "running",
              startedAt: input.startedAt ?? (yield* Clock.currentTimeMillis),
              ...(input.versionId && { versionId: input.versionId }),
            };
            yield* persistence.set([REVIEWS, wsId, id], run);
            return run;
          });

        const getRun = (
          id: string,
        ): Effect.Effect<
          ReviewRun | undefined,
          PersistenceError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const entry = yield* persistence.get<ReviewRun>([
              REVIEWS,
              wsId,
              id,
            ]);
            return entry?.value;
          });

        const listRuns = (
          path?: string,
        ): Effect.Effect<ReviewRun[], PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const { entries } = yield* persistence.list<ReviewRun>([
              REVIEWS,
              wsId,
            ]);
            return sortBy(
              entries
                .map((e) => e.value)
                .filter((run) => path === undefined || run.path === path),
              (run) => run.startedAt,
              { order: "desc" },
            );
          });

        /** End a run; the lease fields never survive the final state. */
        const endRun = (
          id: string,
          status: ReviewRunStatus,
          extra: { summary?: string; error?: string },
        ): Effect.Effect<
          ReviewRun | undefined,
          PersistenceError | ConcurrentModificationError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const key: Key = [REVIEWS, wsId, id];
            const entry = yield* persistence.get<ReviewRun>(key);
            if (!entry) return undefined;
            const ended: ReviewRun = {
              ...stripLease(entry.value),
              status,
              completedAt: yield* Clock.currentTimeMillis,
              ...extra,
            };
            yield* persistence.batch([{ type: "set", key, value: ended }], {
              checks: [{ key, versionstamp: entry.versionstamp }],
            });
            return ended;
          });

        const completeRun = (id: string, summary: string) =>
          endRun(id, "completed", { summary });

        const failRun = (id: string, error: string) =>
          endRun(id, "failed", { error });

        const claimRun = (
          id: string,
          { owner, heartbeatAtLeast }: ClaimOptions,
        ): Effect.Effect<
          ReviewRun | undefined,
          PersistenceError,
          WorkspaceId
        > =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const key: Key = [REVIEWS, wsId, id];
            const entry = yield* persistence.get<ReviewRun>(key);
            if (!entry) return undefined;
            const { leaseOwner, heartbeatAt } = entry.value;
            const heldByOther =
              leaseOwner !== undefined && leaseOwner !== owner;
            if (heldByOther && (heartbeatAt ?? 0) >= heartbeatAtLeast) {
              return undefined;
            }
            const claimed: ReviewRun = {
              ...entry.value,
              leaseOwner: owner,
              heartbeatAt: yield* Clock.currentTimeMillis,
            };
            // A lost race (concurrent claim) reads as "not claimable", not
            // as a backend fault.
            const outcome = yield* Effect.result(
              persistence.batch([{ type: "set", key, value: claimed }], {
                checks: [{ key, versionstamp: entry.versionstamp }],
              }),
            );
            if (Result.isFailure(outcome)) {
              if (outcome.failure instanceof ConcurrentModificationError) {
                return undefined;
              }
              return yield* Effect.fail(outcome.failure);
            }
            return claimed;
          });

        const heartbeatRun = (
          id: string,
          owner: string,
        ): Effect.Effect<boolean, PersistenceError, WorkspaceId> =>
          Effect.gen(function* () {
            const { wsId } = yield* WorkspaceId;
            const key: Key = [REVIEWS, wsId, id];
            const entry = yield* persistence.get<ReviewRun>(key);
            if (!entry || entry.value.leaseOwner !== owner) return false;
            const renewed: ReviewRun = {
              ...entry.value,
              heartbeatAt: yield* Clock.currentTimeMillis,
            };
            const outcome = yield* Effect.result(
              persistence.batch([{ type: "set", key, value: renewed }], {
                checks: [{ key, versionstamp: entry.versionstamp }],
              }),
            );
            if (Result.isFailure(outcome)) {
              if (outcome.failure instanceof ConcurrentModificationError) {
                return false;
              }
              return yield* Effect.fail(outcome.failure);
            }
            return true;
          });

        return ReviewRuns.of({
          createRun,
          getRun,
          listRuns,
          completeRun,
          failRun,
          claimRun,
          heartbeatRun,
        });
      }),
    );
}
