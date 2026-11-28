import { computed, createModel, signal } from "@preact/signals";

import type { CategoriesData, CategoryData } from "./categories.data";
import type { MarkData } from "./marks.data.ts";

export const CategoriesModel = createModel((data: CategoriesData) => {
  const list = signal<readonly CategoryData[]>(data);
  const byId = computed(() => new Map(list.value.map((category) => [category.id, category])));

  /** The category of a mark; none for an uncategorised mark or a deleted category. */
  function categoryOf(mark: Pick<MarkData, "categoryId">): CategoryData | undefined {
    return mark.categoryId == null ? undefined : byId.value.get(mark.categoryId);
  }

  return { list, byId, categoryOf };
});

export type Categories = InstanceType<typeof CategoriesModel>;
