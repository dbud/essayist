import { CategorySchema, ModelPoolSchema, PromptSchema, ReviewPassSchema } from "@essayist/core";
import { Schema } from "effect";

export const AdminConfigData = Schema.Struct({
  modelPools: Schema.Array(ModelPoolSchema),
  prompts: Schema.Array(PromptSchema),
  categories: Schema.Array(CategorySchema),
  reviewPasses: Schema.Array(ReviewPassSchema),
  activeReviewPassId: Schema.optional(Schema.String),
});

export type AdminConfigData = Schema.Schema.Type<typeof AdminConfigData>;
