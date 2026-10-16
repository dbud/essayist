import { CategoriesModel } from "#/models/categories.ts";
import { createModelContext } from "#/models/context.ts";
import { PageInfoModel } from "#/models/pageInfo.ts";
import { VotesModel } from "#/models/votes.ts";
import type { HomePageData } from "./data";

export default function createModels(data: HomePageData) {
  const pageInfo = new PageInfoModel(data.pageInfo);
  const votes = new VotesModel(data.votes);
  const categories = new CategoriesModel(data.categories);
  return { pageInfo, votes, categories };
}

export type HomeModels = ReturnType<typeof createModels>;

export const { Provider: HomeModelsProvider, use: useHomeModels } =
  createModelContext<HomeModels>("HomeModels");
