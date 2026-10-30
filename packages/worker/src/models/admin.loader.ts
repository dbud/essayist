import { type PersistenceError, ReviewConfig } from "@essayist/core";
import { Effect } from "effect";

import type { AdminConfigData } from "./admin.data.ts";

export function adminConfigLoader(): Effect.Effect<
  AdminConfigData,
  PersistenceError,
  ReviewConfig
> {
  return Effect.map(
    Effect.all([
      ReviewConfig.use((store) => store.listModelPools()),
      ReviewConfig.use((store) => store.listPrompts()),
      ReviewConfig.use((store) => store.listCategories()),
      ReviewConfig.use((store) => store.listReviewPasses()),
      ReviewConfig.use((store) => store.getActiveReviewPassId()),
    ]),
    ([modelPools, prompts, categories, reviewPasses, activeReviewPassId]) => ({
      modelPools,
      prompts,
      categories,
      reviewPasses,
      activeReviewPassId,
    }),
  );
}
