import type { Effect } from "effect";

import type { TraceEvent } from "../trace/types.ts";
import type { ReviewRun } from "../types.ts";

export interface ReviewObserver {
  onTrace(event: TraceEvent): Effect.Effect<void>;
  onSettled(run: ReviewRun): Effect.Effect<void>;
}
