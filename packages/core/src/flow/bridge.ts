import { Effect } from "effect";

/** Bridges a promise-only step onto Effect; drops out as steps go native. */
export function fromStep<A>(run: () => Promise<A>): Effect.Effect<A, Error> {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });
}
