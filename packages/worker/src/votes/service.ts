// Prototype scaffold for the service wiring; deleted once real domain
// services land from core (in-memory per isolate).
import { Context, Effect, Layer } from "effect";

export interface Interface {
  get(): Effect.Effect<number>;
  increment(): Effect.Effect<number>;
  decrement(): Effect.Effect<number>;
  chaos(): Effect.Effect<boolean>;
}

const state = { count: 0 };
const armed = { value: false };

// Armed by chaos(); votes ops fail until it is disarmed.
function guarded(next: number): number {
  if (armed.value) {
    throw new Error("votes service: sabotaged");
  }
  return next;
}

export class Votes extends Context.Service<Votes, Interface>()(
  "@essayist/worker/votes/Votes",
) {
  static readonly layerMemory: Layer.Layer<Votes> = Layer.succeed(
    Votes,
    Votes.of({
      get: () => Effect.sync(() => guarded(state.count)),
      increment: () =>
        Effect.sync(() => {
          const next = guarded(state.count + 1);
          state.count = next;
          return next;
        }),
      decrement: () =>
        Effect.sync(() => {
          const next = guarded(state.count - 1);
          state.count = next;
          return next;
        }),
      chaos: () => Effect.sync(() => (armed.value = !armed.value)),
    }),
  );
}
