import { CategoriesModel } from "#/models/categories.ts";
import { createModelContext } from "#/models/utils/context.ts";

import type { HomePageData } from "./data";

export default function createModels(data: HomePageData) {
  return { categories: new CategoriesModel(data.categories) };
}

export type HomeModels = ReturnType<typeof createModels>;

export const { Provider: HomeModelsProvider, use: useHomeModels } =
  createModelContext<HomeModels>("HomeModels");
