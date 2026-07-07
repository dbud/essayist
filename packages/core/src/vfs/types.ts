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
export interface WriteResult {
  path: string;
  lines: number;
  created: boolean;
}

/** A file entry from listing. */
export interface FileEntry {
  path: string;
  lines: number;
}

/** A single grep match with context. */
export interface GrepMatch {
  path: string;
  line_number: number;
  line: string;
  before: string[];
  after: string[];
}

/** Options for grep search. */
export interface GrepOptions {
  path?: string;
  caseSensitive?: boolean;
  maxResults?: number;
}

/** Result of a grep operation. */
export interface GrepResult {
  matches: GrepMatch[];
}

export type MarkStatus = "resolved" | "stale";

export interface MarkOptions {
  label?: string;
  lineHint?: number;
  threadId?: string;
  contextSpan?: number;
}

/**
 * A mark on a text span in a specific version of a file.
 *
 * Marks are version-bound: each mark belongs to exactly one version.
 * When a new version is created (via write), marks from the previous
 * version are migrated using the mark resolver. If the mark's text
 * can be found in the new content, the mark is copied as "resolved".
 * Otherwise, it is copied as "stale".
 */
export interface Mark {
  id: string;
  thread_id: string; // stable id across versions
  path: string;
  version_id: string;
  selected_text: string;
  before_context: string;
  after_context: string;
  comment: string;
  label?: string;
  created_at: number;
  offset: number;
  length: number;
  status: MarkStatus;
}

/** Result of a mark operation. */
export interface MarkResult {
  mark_id: string;
  thread_id: string;
  marked: boolean;
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

/** Result of a diff operation. */
export interface DiffResult {
  diff: string;
}

/**
 * Virtual file system interface.
 *
 * All file paths are strings (e.g. "essay.txt", "notes/ideas.md").
 * Line numbers are 1-based and inclusive.
 *
 * VFS maintains a sequence of immutable versions for each file.
 * The latest version is the current content. Marks are tied to
 * specific versions and are migrated on write.
 */
export interface VFS {
  /** Read file content. By default reads the latest version. */
  read(path: string, options?: ReadOptions): Promise<FileReadResult>;

  /**
   * Write new content, creating a new version.
   * Snapshots the old version and migrates its marks to the new version.
   */
  write(path: string, content: string): Promise<WriteResult>;

  /** List files, optionally filtered by path prefix. */
  list(prefix?: string): Promise<FileEntry[]>;

  /** Search files for a regex pattern. */
  grep(pattern: string, options?: GrepOptions): Promise<GrepResult>;

  /** Search files for plain text (escaped as literal regex). */
  search(text: string, options?: GrepOptions): Promise<GrepResult>;

  /** Place a mark on a text span in the latest version of a file. */
  mark(
    path: string,
    selectedText: string,
    comment: string,
    options?: MarkOptions,
  ): Promise<MarkResult>;

  /** Get marks for a specific version of a file. */
  getMarks(path: string, versionId: string): Promise<Mark[]>;

  /** Delete a mark by ID. Returns true if the mark existed. */
  deleteMark(path: string, versionId: string, markId: string): Promise<boolean>;

  /** Get version history for a file. */
  getHistory(path: string): Promise<FileVersion[]>;

  /**
   * Revert a file to a previous version.
   * Creates a new version with the old content.
   * Marks from the reverted version are copied to the new version.
   */
  revert(path: string, versionId: string): Promise<boolean>;

  /** Get unified diff between two versions. */
  diff(path: string, versionA: string, versionB: string): Promise<DiffResult>;
}
