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

/** Result of a write operation. */
export interface WriteResult extends FileVersion {
  path: string;
  created: boolean;
}

/** A file entry from listing. */
export interface FileEntry {
  path: string;
  lines: number;
}

/** A file version snapshot -- version metadata + content. */
export interface FileSnapshot extends FileVersion {
  content: string;
}

/** Result of a read operation -- snapshot + line range window. */
export interface FileReadResult extends FileSnapshot {
  start_line: number;
  end_line: number;
}

/** Metadata about a file version (no content). */
export interface FileVersion {
  version_id: string;
  timestamp: number;
  lines: number;
}

/** The persisted draft head. */
export interface DraftSnapshot {
  content: string;
  timestamp: number;
}

/** Result of a diff operation. */
export interface DiffResult {
  diff: string;
}
