import { Schema } from "effect";

/** Options for reading a file. */
export interface ReadOptions {
  /** Version ID to read. If omitted, reads the latest version. */
  versionId?: string;
  /** First line to return (1-based, inclusive). Defaults to 1. */
  startLine?: number;
  /** Last line to return (1-based, inclusive). Defaults to the last line. */
  endLine?: number;
  /** If true, prefix each line with its line number. */
  numbered?: boolean;
}

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

/** Result of a read operation -- snapshot + line range window. */
export interface FileReadResult extends FileSnapshot {
  start_line: number;
  end_line: number;
}

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
