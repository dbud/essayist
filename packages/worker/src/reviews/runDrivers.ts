import type { RunRef } from "@essayist/core";
import { Context, Effect, Layer } from "effect";

export interface Interface {
  /** Resolves without waiting for the drive. */
  wake(ref: RunRef): Effect.Effect<void>;
}

export class RunDrivers extends Context.Service<RunDrivers, Interface>()(
  "@essayist/worker/reviews/RunDrivers",
) {
  static layerOf(runDriver: Cloudflare.Env["RUN_DRIVER"]): Layer.Layer<RunDrivers> {
    return Layer.succeed(RunDrivers, {
      wake: (ref) =>
        Effect.tryPromise({
          try: () => runDriver.getByName(ref.runId).wake(ref),
          catch: (cause) => cause,
        }).pipe(Effect.orDie),
    });
  }
}
