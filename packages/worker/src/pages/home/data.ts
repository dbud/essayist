import { Schema } from "effect";
import { CategoriesData } from "#/models/categories.data.ts";

export const HomePageData = Schema.Struct({
  categories: CategoriesData,
});

export type HomePageData = Schema.Schema.Type<typeof HomePageData>;
