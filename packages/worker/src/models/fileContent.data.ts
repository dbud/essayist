import { File, FileDraft, FileSnapshot, FileVersion } from "@essayist/core";
import { Schema } from "effect";

/** A version of a file, and the unsaved draft on it when the version is the latest. */
export const FileContentData = Schema.Struct({
  version: FileSnapshot.json,
  draft: Schema.NullOr(FileDraft.json),
});

export type FileContentData = typeof FileContentData.Encoded;

/** The file a write landed on and the version it saved; `created` when the path was new. */
export const FileWriteData = Schema.Struct({
  file: File.json,
  version: FileVersion.json,
  created: Schema.Boolean,
});

export type FileWriteData = typeof FileWriteData.Encoded;
