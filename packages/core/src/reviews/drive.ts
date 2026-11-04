import { Effect } from "effect";

import {
  type ConfigInvalidError,
  type ConfigMissingError,
  resolveActiveReviewPass,
} from "#/config/resolve.ts";
import type { ReviewConfig } from "#/config/service.ts";
import type { Files } from "#/files/service.ts";
import type { Marks } from "#/marks/service.ts";
import type { ModelClient } from "#/model/service.ts";
import type { MissingChunksError } from "#/persistence/chunked_values.ts";
import type { ConcurrentModificationError, PersistenceError } from "#/persistence/mod.ts";
import type { ReviewPacing } from "#/reviews/pacing.ts";
import { type ReviewFileMissingError, resumeReviewPass } from "#/reviews/runner.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import type { TraceEvents } from "#/reviews/trace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

export interface RunRef {
  readonly runId: string;
  readonly wsId: string;
}

/** A taken lease and a missing run are outcomes, not failures. */
export type DriveError =
  | ReviewFileMissingError
  | ConfigMissingError
  | ConfigInvalidError
  | PersistenceError
  | ConcurrentModificationError
  | MissingChunksError;

type DriveServices =
  | ReviewConfig
  | Files
  | Marks
  | ModelClient
  | ReviewPacing
  | ReviewRuns
  | TraceEvents;

/** True when the run settled or is gone. */
export function driveReviewRun({
  runId,
  wsId,
}: RunRef): Effect.Effect<boolean, DriveError, DriveServices> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.getRun(runId);
    if (run === undefined || run.status !== "running") return true;
    const pass = yield* resolveActiveReviewPass;
    if (pass === undefined) {
      yield* Effect.logWarning("review run parked: no active pass is configured", {
        runId,
      });
      return false;
    }
    yield* resumeReviewPass({ pass, path: run.path }, runId);
    return true;
  }).pipe(
    Effect.catchTag("ReviewLeaseTakenError", () => Effect.succeed(false)),
    Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(true)),
    Effect.provideService(WorkspaceId, { wsId }),
  );
}
