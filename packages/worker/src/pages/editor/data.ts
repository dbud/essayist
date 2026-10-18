import { Schema } from "effect";
import { FileTreesData } from "#/models/fileTrees.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";

export const EditorData = Schema.Struct({
  workspaces: WorkspacesData,
  fileTrees: FileTreesData,
});

export type EditorData = Schema.Schema.Type<typeof EditorData>;
