import { Schema } from "effect";
import { FileTreeData } from "#/models/fileTree.data.ts";
import { WorkspacesData } from "#/models/workspaces.data.ts";

export const EditorData = Schema.Struct({
  workspaces: WorkspacesData,
  fileTree: Schema.NullOr(FileTreeData),
});

export type EditorData = Schema.Schema.Type<typeof EditorData>;
