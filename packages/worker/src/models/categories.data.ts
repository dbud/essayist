import { Category } from "@essayist/core";
import { Schema } from "effect";

export const CategoriesData = Schema.Array(Category.json);

export type CategoriesData = typeof CategoriesData.Encoded;
