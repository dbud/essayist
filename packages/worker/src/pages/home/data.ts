import { CategorySchema } from "@essayist/core";
import { Schema } from "effect";
import { PageInfoDataSchema } from "#/models/pageInfo.data.ts";
import { VotesDataSchema } from "#/models/votes.data.ts";

export const HomePageDataSchema = Schema.Struct({
  pageInfo: PageInfoDataSchema,
  votes: VotesDataSchema,
  categories: Schema.Array(CategorySchema),
});

export type HomePageData = typeof HomePageDataSchema.Type;

export const decodeHomePageData = Schema.decodeUnknownSync(HomePageDataSchema);
