import { ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { Schema } from "effect";

import { CategoryData } from "./categories.data.ts";

export const ModelPoolData = ModelPool.json;
export type ModelPoolData = typeof ModelPoolData.Encoded;

export const PromptData = Prompt.json;
export type PromptData = typeof PromptData.Encoded;

export const ReviewPassData = ReviewPass.json;
export type ReviewPassData = typeof ReviewPassData.Encoded;

export const AdminConfigData = Schema.Struct({
  modelPools: Schema.Array(ModelPoolData),
  prompts: Schema.Array(PromptData),
  categories: Schema.Array(CategoryData),
  reviewPasses: Schema.Array(ReviewPassData),
  activeReviewPassId: Schema.OptionFromOptionalKey(Schema.String),
});

export type AdminConfigData = typeof AdminConfigData.Encoded;
