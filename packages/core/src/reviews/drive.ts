import { Effect, Result } from "effect";

import { resolveReviewPassById } from "#/config/resolve.ts";
import type { ReviewConfig } from "#/config/service.ts";
import type { Files } from "#/files/service.ts";
import type { Marks } from "#/marks/service.ts";
import type { ModelClient } from "#/model/service.ts";
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

export type DriveServices =
  | ReviewConfig
  | Files
  | Marks
  | ModelClient
  | ReviewPacing
  | ReviewRuns
  | TraceEvents;

/** True when the run settled or is gone, false when another driver holds it. */
export function driveReviewRun(
  { runId, wsId }: RunRef,
  observer: ReviewObserver,
): Effect.Effect<boolean, never, DriveServices> {
  return Effect.gen(function* () {
    const runs = yield* ReviewRuns;
    const run = yield* runs.getRun(runId);
    if (run.status !== "running") return true;
    // the run keeps the pass it was started with, so a pass that is gone or no longer resolves can
    // never finish it
    const pass = yield* Effect.result(resolveReviewPassById(run.reviewPassId));
    if (Result.isFailure(pass)) {
      const failed = yield* runs.failRun(runId, pass.failure.message);
      yield* tolerate(observer).onSettled(failed);
      return true;
    }
    yield* resumeReviewRun(pass.success, runId, observer);
    return true;
  }).pipe(
    Effect.catchTag("ReviewLeaseTakenError", () => Effect.succeed(false)),
    Effect.catchTag("ReviewRunMissingError", () => Effect.succeed(true)),
    Effect.provideService(WorkspaceId, { wsId }),
  );
}
