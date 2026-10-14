// Prototype scaffold for the service wiring; deleted once real domain
// services land from core (in-memory per isolate).
import { Context, Effect, Layer } from "effect";

export interface Interface {
  get(): Effect.Effect<number>;
  increment(): Effect.Effect<number>;
  decrement(): Effect.Effect<number>;
}

const state = { count: 0 };

export class Votes extends Context.Service<Votes, Interface>()(
  "@essayist/worker/votes/Votes",
) {
  static readonly layerMemory: Layer.Layer<Votes> = Layer.succeed(
    Votes,
    Votes.of({
      get: () => Effect.sync(() => state.count),
      increment: () => Effect.sync(() => (state.count += 1)),
      decrement: () => Effect.sync(() => (state.count -= 1)),
    }),
  );
}
