import { Category } from "@essayist/core";
import { Schema } from "effect";

export const CategoryData = Category.json;
export type CategoryData = typeof CategoryData.Encoded;

export const CategoriesData = Schema.Array(CategoryData);
export type CategoriesData = typeof CategoriesData.Encoded;
