import { Context, type Effect } from "effect";

import type { RunRef } from "./drive.ts";

export interface Interface {
  /** Running runs with no lease, or a heartbeat older than `staleMs`, oldest first. */
  staleRuns(staleMs: number): Effect.Effect<ReadonlyArray<RunRef>>;
}

export class ReviewJanitor extends Context.Service<ReviewJanitor, Interface>()(
  "@essayist/core/reviews/ReviewJanitor",
) {}
