import { CategorySchema } from "@essayist/core";
import { Schema } from "effect";

export const HomePageData = Schema.Struct({
  categories: Schema.Array(CategorySchema),
});

export type HomePageData = Schema.Schema.Type<typeof HomePageData>;
