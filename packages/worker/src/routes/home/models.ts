import { createModelContext } from "@/models/context";
import { PageInfoModel } from "@/models/pageInfo";
import { VotesModel } from "@/models/votes";
import type { HomePageData } from "./data";

// Models instantiate in dependency order; later models can take earlier ones.
export function createHomeModels(data: HomePageData) {
  const pageInfo = new PageInfoModel(data.pageInfo);
  const votes = new VotesModel(data.votes);
  return { pageInfo, votes };
}

export type HomeModels = ReturnType<typeof createHomeModels>;

export const { Provider: HomeModelsProvider, use: useHomeModels } =
  createModelContext<HomeModels>("HomeModels");
