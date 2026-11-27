import { File, FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileEntry = Schema.Struct({ file: File.json, latest: FileVersion.json });

export const FileTreeData = Schema.Struct({
  files: Schema.Array(FileEntry),
  selectedPath: Schema.NullOr(Schema.String),
  selectedVersionId: Schema.NullOr(Schema.String),
});

export type FileTreeData = typeof FileTreeData.Encoded;
