/**
 * Fresh ids through a reference with a default: call sites need no wiring,
 * and tests can provide a deterministic generator.
 */

import { Context } from "effect";

/** An id that stays unique across restarts. */
export const randomId = (): string => crypto.randomUUID();

export interface IdGenerator {
  next(): string;
}

export const Ids: Context.Reference<IdGenerator> = Context.Reference(
  "@essayist/core/Ids",
  { defaultValue: () => ({ next: randomId }) },
);
