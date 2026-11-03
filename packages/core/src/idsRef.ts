/** The Ids reference on the effect side, over the plain generators in ids.ts. */

import { Context } from "effect";

import { randomId, type IdGenerator } from "#/ids.ts";

export const Ids: Context.Reference<IdGenerator> = Context.Reference("@essayist/core/Ids", {
  defaultValue: () => ({ next: randomId }),
});
