import { Effect } from "effect";

import { resolveReviewPassById } from "#/config/resolve.ts";
import type { ReviewConfig } from "#/config/service.ts";
import type { PersistenceError } from "#/persistence/mod.ts";
import type { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { reviewPlan } from "./adapter.ts";
import { type ProgressFeed, progressFeed, type ReviewPlan } from "./progress.ts";
import { TraceEvents } from "./trace/service.ts";
import type { ReviewRun } from "./types.ts";

/**
 * The progress feed of a run, from its own pass and its stored trace. A pass that is gone or no
 * longer resolves leaves the plan empty; placed marks still count.
 */
export function loadProgressFeed(
  run: Pick<ReviewRun, "id" | "reviewPassId">,
): Effect.Effect<ProgressFeed, PersistenceError, ReviewConfig | TraceEvents | WorkspaceId> {
  return Effect.gen(function* () {
    const pass = yield* resolveReviewPassById(run.reviewPassId).pipe(
      Effect.catchTags({
        ConfigMissingError: () => Effect.succeed(undefined),
        ConfigInvalidError: () => Effect.succeed(undefined),
      }),
    );
    const plan: ReviewPlan = pass === undefined ? new Map() : reviewPlan(pass);
    const trace = yield* TraceEvents.use((traces) => traces.get(run.id));
    return progressFeed(plan, trace);
  });
}
