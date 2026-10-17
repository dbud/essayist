import { Schema } from "effect";
import { WorkspacesData } from "#/models/workspaces.data.ts";

export const EditorData = Schema.Struct({ workspaces: WorkspacesData });

export type EditorData = Schema.Schema.Type<typeof EditorData>;
