import { createModel, signal } from "@preact/signals";
import type { CategoriesData } from "./categories.data";

export const CategoriesModel = createModel((data: CategoriesData) => {
  const list = signal(data);
  return { list };
});

export type Categories = InstanceType<typeof CategoriesModel>;
