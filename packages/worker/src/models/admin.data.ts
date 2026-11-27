import { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { Schema } from "effect";

export const AdminConfigData = Schema.Struct({
  modelPools: Schema.Array(ModelPool.json),
  prompts: Schema.Array(Prompt.json),
  categories: Schema.Array(Category.json),
  reviewPasses: Schema.Array(ReviewPass.json),
  activeReviewPassId: Schema.OptionFromOptionalKey(Schema.String),
});

export type AdminConfigData = typeof AdminConfigData.Encoded;
