import { Context } from "effect";

export class ReviewPacing extends Context.Service<
  ReviewPacing,
  {
    readonly heartbeatMs: number;
    /** Milliseconds after the last heartbeat before another driver may claim the run. */
    readonly staleMs: number;
  }
>()("@essayist/core/reviews/ReviewPacing") {}
