/**
 * Review runs as an Effect service: creation, reads, and listing for now;
 * claim, heartbeat, and end-state ops land alongside in later commits.
 *
 * Key layout:
 *   ["reviews", wsId, runId] -> ReviewRun
 */

import { sortBy } from "@std/collections";
import { Context, Effect, Layer } from "effect";
import {
  type ConcurrentModificationError,
  Persistence,
  type PersistenceError,
} from "@/persistence/mod.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import type { ReviewRun } from "./types.ts";

const REVIEWS = "reviews";

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
            const id = crypto.randomUUID();
            const run: ReviewRun = {
              id,
              wsId,
              path: input.path,
              reviewPassId: input.reviewPassId,
              status: "running",
              startedAt: input.startedAt ?? Date.now(),
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

        return ReviewRuns.of({
          createRun,
          getRun,
          listRuns,
        });
      }),
    );
}
