import { Workspace } from "@essayist/core";
import { Schema } from "effect";

export const WorkspacesData = Schema.Struct({
  workspaces: Schema.Array(Workspace),
  selectedId: Schema.NullOr(Schema.String),
});

export type WorkspacesData = Schema.Schema.Type<typeof WorkspacesData>;
