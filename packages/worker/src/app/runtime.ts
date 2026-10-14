// Loader glue. The worker-env bindings layer attaches here when a real
// feature lands.
import { Effect } from "effect";

export async function runLoader<A>(
  self: Effect.Effect<A, never, never>,
): Promise<A> {
  return Effect.runPromise(self);
}
