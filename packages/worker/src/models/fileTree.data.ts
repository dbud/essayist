import { File, FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileEntryData = Schema.Struct({ file: File.json, latest: FileVersion.json });
export type FileEntryData = typeof FileEntryData.Encoded;

export const FileTreeData = Schema.Struct({
  files: Schema.Array(FileEntryData),
  selectedPath: Schema.NullOr(Schema.String),
  selectedVersionId: Schema.NullOr(Schema.String),
});

export type FileTreeData = typeof FileTreeData.Encoded;
