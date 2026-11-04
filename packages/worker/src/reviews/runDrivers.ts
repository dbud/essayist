/**
 * The api tier's handle on the run drivers: a kick schedules the run's first beat and resolves
 * without waiting for the drive. Faults die per the worker convention.
 */

import type { RunRef } from "@essayist/core";
import { Context, Effect, Layer } from "effect";

export interface Interface {
  /** Store the run ref on the driver and arm its first beat. */
  kick(ref: RunRef): Effect.Effect<void>;
}

export class RunDrivers extends Context.Service<RunDrivers, Interface>()(
  "@essayist/worker/reviews/RunDrivers",
) {
  static layerOf(runDriver: Cloudflare.Env["RUN_DRIVER"]): Layer.Layer<RunDrivers> {
    return Layer.succeed(RunDrivers, {
      kick: (ref) =>
        Effect.tryPromise({
          try: () => runDriver.getByName(ref.runId).start(ref),
          catch: (cause) => cause,
        }).pipe(Effect.orDie),
    });
  }
}
