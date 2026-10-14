import { DateTime, Effect } from "effect";

export interface HomeData {
  readonly message: string;
  readonly renderedAt: string;
}

export const homeLoader: Effect.Effect<HomeData> = Effect.gen(function* () {
  const now = yield* DateTime.now;
  return {
    message: "Worker runtime prototype: hono + preact SSR",
    renderedAt: DateTime.formatIso(now),
  };
});
