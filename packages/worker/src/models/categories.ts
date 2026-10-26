import type { Category } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { unimplemented } from "@std/assert";
import type { CategoriesData } from "./categories.data";

export const CategoriesModel = createModel((data: CategoriesData) => {
  const list = signal<readonly Category[]>(data);
  const byLabel = computed(
    () => new Map(list.value.map((c) => [c.label, c] as const)),
  );
  return { list, byLabel };
});

export type Categories = InstanceType<typeof CategoriesModel>;

export function getCategories(): Categories {
  unimplemented("the categories are not wired into the editor yet");
}
