import { Effect } from "effect";

import type { ReviewObserver } from "./types.ts";

/** A failing observer is a logged defect, never a failed run. */
export function tolerate(observer: ReviewObserver): ReviewObserver {
  return {
    onTrace: (event) => logDefect(observer.onTrace(event)),
    onSettled: (run) => logDefect(observer.onSettled(run)),
  };
}

function logDefect<A>(self: Effect.Effect<A>): Effect.Effect<void | A> {
  return Effect.catchDefect(self, (cause) =>
    Effect.logError("review observer failed", { error: asMessage(cause) }),
  );
}

function asMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
