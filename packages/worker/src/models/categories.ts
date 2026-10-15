import type { Category } from "@essayist/core";
import { createModel, signal } from "@preact/signals";

export const CategoriesModel = createModel((data: readonly Category[]) => {
  const list = signal(data);
  return { list };
});

export type Categories = InstanceType<typeof CategoriesModel>;
