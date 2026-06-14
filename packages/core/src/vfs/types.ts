/** Result of a read operation. */
export interface ReadResult {
  content: string;
  total_lines: number;
  start_line: number;
  end_line: number;
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

/** A file version snapshot. */
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
  /** Read file content, optionally a line range. */
  read(
    path: string,
    startLine?: number,
    endLine?: number,
    numbered?: boolean,
  ): ReadResult;

  /**
   * Write new content, creating a new version.
   * Snapshots the old version and migrates its marks to the new version.
   */
  write(path: string, content: string): WriteResult;

  /** List files, optionally filtered by path prefix. */
  list(prefix?: string): FileEntry[];

  /** Search files for a regex pattern. */
  grep(pattern: string, options?: GrepOptions): GrepResult;

  /** Search files for plain text (escaped as literal regex). */
  search(text: string, options?: GrepOptions): GrepResult;

  /** Place a mark on a text span in a specific version of a file. */
  mark(
    path: string,
    versionId: string,
    selectedText: string,
    comment: string,
    label?: string,
  ): MarkResult;

  /** Get marks for a specific version of a file. */
  getMarks(path: string, versionId: string): Mark[];

  /** Delete a mark by ID. Returns true if the mark existed. */
  deleteMark(markId: string): boolean;

  /** Get version history for a file. */
  getHistory(path: string): FileVersion[];

  /**
   * Revert a file to a previous version.
   * Creates a new version with the old content.
   * Marks from the reverted version are copied to the new version.
   */
  revert(path: string, versionId: string): boolean;

  /** Get the content of a specific version. Returns empty string if version not found. */
  getVersionContent(path: string, versionId: string): string;

  /** Get unified diff between two versions. */
  diff(path: string, versionA: string, versionB: string): DiffResult;
}
