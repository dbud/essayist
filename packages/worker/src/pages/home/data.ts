import { CategorySchema } from "@essayist/core";
import { Schema } from "effect";
import { PageInfoDataSchema } from "#/models/pageInfo.data.ts";
import { VotesDataSchema } from "#/models/votes.data.ts";

export const HomePageData = Schema.Struct({
  pageInfo: PageInfoDataSchema,
  votes: VotesDataSchema,
  categories: Schema.Array(CategorySchema),
});

export type HomePageData = Schema.Schema.Type<typeof HomePageData>;
