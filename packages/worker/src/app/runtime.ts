// Loader glue. The worker-env bindings layer attaches here when a real
// feature lands.
import { Effect } from "effect";
import { Votes } from "@/votes/service";

export async function runLoader<A>(
  self: Effect.Effect<A, never, Votes>,
): Promise<A> {
  return Effect.runPromise(self.pipe(Effect.provide(Votes.layerMemory)));
}
