import { CategorySchema } from "@essayist/core";
import { Schema } from "effect";

export const CategoriesData = Schema.Array(CategorySchema);

export type CategoriesData = typeof CategoriesData.Type;
