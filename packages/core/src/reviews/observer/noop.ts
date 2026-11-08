import { Effect } from "effect";

import type { ReviewObserver } from "./types.ts";

/** For drives nobody is watching. */
export const noopObserver: ReviewObserver = {
  onTrace: () => Effect.void,
  onSettled: () => Effect.void,
};
