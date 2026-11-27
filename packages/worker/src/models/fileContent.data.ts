import { File, FileDraft, FileSnapshot, FileVersion } from "@essayist/core";
import { Schema } from "effect";

export const FileSnapshotData = FileSnapshot.json;
export type FileSnapshotData = typeof FileSnapshotData.Encoded;

export const FileDraftData = FileDraft.json;
export type FileDraftData = typeof FileDraftData.Encoded;

/** A version of a file, and the unsaved draft on it when the version is the latest. */
export const FileContentData = Schema.Struct({
  version: FileSnapshotData,
  draft: Schema.NullOr(FileDraftData),
});

export type FileContentData = typeof FileContentData.Encoded;

/** The file a write landed on and the version it saved; `created` when the path was new. */
export const FileWriteData = Schema.Struct({
  file: File.json,
  version: FileVersion.json,
  created: Schema.Boolean,
});

export type FileWriteData = typeof FileWriteData.Encoded;
