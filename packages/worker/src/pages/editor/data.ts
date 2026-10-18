import { Schema } from "effect";
import { CategoriesData } from "#/models/categories.data.ts";
import { FileTreesData } from "#/models/fileTrees.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";

export const EditorData = Schema.Struct({
  workspaces: WorkspacesData,
  fileTrees: FileTreesData,
  categories: CategoriesData,
});

export type EditorData = Schema.Schema.Type<typeof EditorData>;
