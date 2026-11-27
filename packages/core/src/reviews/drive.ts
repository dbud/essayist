import { Effect } from "effect";

import {
  type ConfigInvalidError,
  type ConfigMissingError,
  resolveReviewPassById,
} from "#/config/resolve.ts";
import type { ReviewConfig } from "#/config/service.ts";
import type { Files } from "#/files/service.ts";
import type { Marks } from "#/marks/service.ts";
import type { ModelClient } from "#/model/service.ts";
import type { PersistenceError } from "#/persistence/mod.ts";
import { tolerate } from "#/reviews/observer/tolerate.ts";
import type { ReviewObserver } from "#/reviews/observer/types.ts";
import type { ReviewPacing } from "#/reviews/pacing.ts";
import { resumeReviewRun } from "#/reviews/runner.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import type { TraceEvents } from "#/reviews/trace/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

export interface RunRef {
  readonly runId: string;
  readonly wsId: string;
}

/** A taken lease and a missing run are outcomes, not failures; the rest come from the config. */
export type DriveError = ConfigMissingError | ConfigInvalidError | PersistenceError;

export type DriveServices =
  | ReviewConfig
  | Files
  | Marks
  | ModelClient
  | ReviewPacing
  | ReviewRuns
  | TraceEvents;

/** True when the run settled or is gone. */
export function driveReviewRun(
  { runId, wsId }: RunRef,
  observer: ReviewObserver,
): Effect.Effect<boolean, DriveError, DriveServices> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.getRun(runId);
    if (run.status !== "running") return true;
    // The run keeps the pass it was started with. A deleted pass can never finish the run.
    const pass = yield* resolveReviewPassById(run.reviewPassId);
    if (pass === undefined) {
      const failed = yield* runs.failRun(
        runId,
        `Review pass "${run.reviewPassId}" no longer exists`,
      );
      yield* tolerate(observer).onSettled(failed);
      return true;
    }
    yield* resumeReviewRun(pass, runId, observer);
    return true;
  }).pipe(
    Effect.catchTag("ReviewLeaseTakenError", () => Effect.succeed(false)),
    Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(true)),
    Effect.provideService(WorkspaceId, { wsId }),
  );
}
