/**
 * Development cleanup of review output: runs, their traces, and their marks. Not part of the
 * product flow; the worker exposes it to admins only.
 */

import { Context, Effect, Layer } from "effect";

import { Files } from "#/files/service.ts";
import type { ConcurrentModificationError, PersistenceError } from "#/persistence/mod.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewRunActiveError, type ReviewRunMissingError, ReviewRuns } from "./service.ts";
import { TraceEvents } from "./trace/service.ts";
import type { ReviewRun } from "./types.ts";

export interface CleanupResult {
  runs: number;
  marks: number;
}

type CleanupError = PersistenceError | ConcurrentModificationError | ReviewRunActiveError;

export interface Interface {
  /**
   * Delete a run, its trace, and its marks on every version of the file, including the copies a
   * later write migrated forward.
   */
  deleteRun(
    runId: string,
  ): Effect.Effect<CleanupResult, CleanupError | ReviewRunMissingError, WorkspaceId>;
  /**
   * Delete the runs started on a version with their traces and marks, and every other mark on that
   * version.
   */
  clearVersion(
    path: string,
    versionId: string,
  ): Effect.Effect<CleanupResult, CleanupError, WorkspaceId>;
  /** Delete every run, trace, and mark of a file. */
  clearFile(path: string): Effect.Effect<CleanupResult, CleanupError, WorkspaceId>;
}

export class ReviewCleanup extends Context.Service<ReviewCleanup, Interface>()(
  "@essayist/core/reviews/ReviewCleanup",
) {
  /** Requires the {@linkcode Files}, {@linkcode ReviewRuns}, and {@linkcode TraceEvents} services.
   * The workspace scope comes from the WorkspaceId tag at call time. */
  static readonly layerNoDeps: Layer.Layer<ReviewCleanup, never, Files | ReviewRuns | TraceEvents> =
    Layer.effect(
      ReviewCleanup,
      Effect.gen(function* () {
        const files = yield* Files;
        const reviewRuns = yield* ReviewRuns;
        const traces = yield* TraceEvents;

        // Refuses the whole scope when any run is still running, before anything is deleted. Marks
        // go first, so a failure part way leaves the run rows in place for a retry.
        const purge = (
          path: string,
          runs: ReadonlyArray<ReviewRun>,
          wipeVersion: (versionId: string) => boolean,
        ): Effect.Effect<CleanupResult, CleanupError, WorkspaceId> =>
          Effect.gen(function* () {
            const active = runs.find((run) => run.status === "running");
            if (active) return yield* Effect.fail(new ReviewRunActiveError({ id: active.id }));

            const runIds = new Set(runs.map((run) => run.id));
            const versions = yield* files
              .getVersions(path)
              .pipe(Effect.catchTag("FileMissingError", () => Effect.succeed([])));
            let marks = 0;
            for (const { version_id } of versions) {
              const wipe = wipeVersion(version_id);
              marks += yield* files.deleteMarksWhere(
                path,
                version_id,
                (mark) => wipe || (mark.meta !== undefined && runIds.has(mark.meta.runId)),
              );
            }

            for (const run of runs) {
              yield* traces.deleteRun(run.id);
              yield* reviewRuns.deleteRun(run.id);
            }
            return { runs: runs.length, marks };
          });

        const deleteRun = (runId: string) =>
          Effect.gen(function* () {
            const run = yield* reviewRuns.getRun(runId);
            return yield* purge(run.path, [run], () => false);
          });

        const clearVersion = (path: string, versionId: string) =>
          Effect.gen(function* () {
            const runs = yield* reviewRuns.listRuns(path);
            return yield* purge(
              path,
              runs.filter((run) => run.versionId === versionId),
              (id) => id === versionId,
            );
          });

        const clearFile = (path: string) =>
          Effect.gen(function* () {
            const runs = yield* reviewRuns.listRuns(path);
            return yield* purge(path, runs, () => true);
          });

        return ReviewCleanup.of({ deleteRun, clearVersion, clearFile });
      }),
    );
}
