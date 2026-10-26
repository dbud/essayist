import { Schema } from "effect";
import { CategoriesData } from "#/models/categories.data.ts";
import { FileContentsData } from "#/models/fileContents.data.ts";
import { FileMarksByPathData } from "#/models/fileMarksByPath.data.ts";
import { FileTreesData } from "#/models/fileTrees.data.ts";
import { FileVersionsByPathData } from "#/models/fileVersionsByPath.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";

export const EditorData = Schema.Struct({
  workspaces: WorkspacesData,
  fileTrees: FileTreesData,
  fileContents: FileContentsData,
  fileVersions: FileVersionsByPathData,
  fileMarks: FileMarksByPathData,
  categories: CategoriesData,
});

export type EditorData = Schema.Schema.Type<typeof EditorData>;
