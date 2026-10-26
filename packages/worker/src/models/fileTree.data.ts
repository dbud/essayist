import { FileEntry } from "@essayist/core";
import { Schema } from "effect";

export const FileTreeData = Schema.Struct({
  files: Schema.Array(FileEntry),
  selectedPath: Schema.NullOr(Schema.String),
  selectedVersionId: Schema.NullOr(Schema.String),
});

export type FileTreeData = Schema.Schema.Type<typeof FileTreeData>;
