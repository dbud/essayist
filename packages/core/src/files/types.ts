import { Schema } from "effect";

/** Metadata about a file version (no content). */
export const FileVersion = Schema.Struct({
  version_id: Schema.String,
  timestamp: Schema.Number,
  lines: Schema.Number,
});
export type FileVersion = Schema.Schema.Type<typeof FileVersion>;

/** Result of a write operation. */
export interface WriteResult extends FileVersion {
  path: string;
  created: boolean;
}

/** A file entry from listing. */
export const FileEntry = Schema.Struct({
  path: Schema.String,
  lines: Schema.Number,
  latestVersionId: Schema.String,
});
export type FileEntry = Schema.Schema.Type<typeof FileEntry>;

/** A file version snapshot -- version metadata + content. */
export const FileSnapshot = Schema.Struct({
  version_id: Schema.String,
  timestamp: Schema.Number,
  lines: Schema.Number,
  content: Schema.String,
});
export type FileSnapshot = Schema.Schema.Type<typeof FileSnapshot>;

/** The persisted draft head. */
export const DraftSnapshot = Schema.Struct({
  content: Schema.String,
  timestamp: Schema.Number,
});
export type DraftSnapshot = Schema.Schema.Type<typeof DraftSnapshot>;

/** Result of a diff operation. */
export interface DiffResult {
  diff: string;
}

/** A read targeted a path or version that does not exist. */
export class FileMissingError extends Schema.TaggedError<FileMissingError>()("FileMissingError", {
  path: Schema.String,
  versionId: Schema.NullOr(Schema.String),
}) {
  override get message() {
    return this.versionId === null
      ? `File ${this.path} does not exist`
      : `Version ${this.versionId} of ${this.path} does not exist`;
  }
}
