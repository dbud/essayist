import { ReviewConfig } from "@essayist/core";
import type { Effect } from "effect";

import type { CategoriesData } from "./categories.data.ts";

export function categoriesLoader(): Effect.Effect<typeof CategoriesData.Type, never, ReviewConfig> {
  return ReviewConfig.use((store) => store.listCategories());
}
