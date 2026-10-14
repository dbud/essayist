// Loader glue and the seam for request env wiring. Loaders are framework
// agnostic Effect programs; the bindings layer built from worker env attaches
// here when the first real feature ports (the env.ts seam).
import { Effect } from "effect";

export async function runLoader<A>(
  self: Effect.Effect<A, never, never>,
): Promise<A> {
  return Effect.runPromise(self);
}
