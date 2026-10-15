import { Schema } from "effect";
import { PageInfoDataSchema } from "#/models/pageInfo.data.ts";
import { VotesDataSchema } from "#/models/votes.data.ts";

// The page's data contract: one entry per model, embedded as the
// page-data script. Server-side; the models module imports the type only.
export const HomePageDataSchema = Schema.Struct({
  pageInfo: PageInfoDataSchema,
  votes: VotesDataSchema,
});

export type HomePageData = typeof HomePageDataSchema.Type;

export const decodeHomePageData = Schema.decodeUnknownSync(HomePageDataSchema);
