import { ReviewJanitor, ReviewPacing } from "@essayist/core";
import { Effect } from "effect";

import { RunDrivers } from "#/reviews/runDrivers.ts";

export const janitorJob = Effect.gen(function* () {
  const janitor = yield* ReviewJanitor;
  const { staleMs } = yield* ReviewPacing;
  const drivers = yield* RunDrivers;
  const stale = yield* janitor.staleRuns(staleMs);
  for (const ref of stale) {
    yield* Effect.logWarning("review janitor resumes an unclaimed run", ref);
    yield* drivers
      .kick(ref)
      .pipe(
        Effect.catchCause((cause) => Effect.logError("review janitor kick failed", { ref, cause })),
      );
  }
});
