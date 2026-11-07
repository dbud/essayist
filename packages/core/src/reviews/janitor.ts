import { Context, type Effect } from "effect";

import type { PersistenceError } from "#/persistence/service.ts";

import type { RunRef } from "./drive.ts";

export interface Interface {
  staleRuns(staleMs: number): Effect.Effect<RunRef[], PersistenceError>;
}

export class ReviewJanitor extends Context.Service<ReviewJanitor, Interface>()(
  "@essayist/core/reviews/ReviewJanitor",
) {}
