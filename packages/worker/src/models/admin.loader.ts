import { ReviewConfig } from "@essayist/core";
import { Effect } from "effect";

import type { AdminConfigData } from "./admin.data.ts";

export function adminConfigLoader(): Effect.Effect<
  typeof AdminConfigData.Type,
  never,
  ReviewConfig
> {
  return Effect.gen(function* () {
    const config = yield* ReviewConfig;
    return {
      modelPools: yield* config.listModelPools(),
      prompts: yield* config.listPrompts(),
      categories: yield* config.listCategories(),
      reviewPasses: yield* config.listReviewPasses(),
      activeReviewPassId: yield* config.getActiveReviewPassId(),
    };
  });
}
