import { Role, Workspace } from "@essayist/core";
import { Schema } from "effect";

export const WorkspacesData = Schema.Struct({
  workspaces: Schema.Array(Schema.Struct({ workspace: Workspace.json, role: Role })),
  selectedId: Schema.NullOr(Schema.String),
});

export type WorkspacesData = typeof WorkspacesData.Encoded;
