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

/** Result of a grep operation. */
export interface GrepResult {
  matches: GrepMatch[];
}

/** A mark on a text span. */
export interface Mark {
  id: string;
  path: string;
  selected_text: string;
  before_context: string;
  after_context: string;
  comment: string;
  label?: string;
  created_at: number;
  /** True if the mark could not be resolved to the current file content. */
  stale?: boolean;
  /** The resolved line number (1-based) when reading marks. Undefined if stale. */
  resolved_line?: number;
}

/** Result of a mark operation. */
export interface MarkResult {
  mark_id: string;
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
 */
export interface VFS {
  /** Read file content, optionally a line range. */
  read(
    path: string,
    startLine?: number,
    endLine?: number,
    numbered?: boolean,
  ): ReadResult;

  /** Write (create or overwrite) a file. Snapshots the old version on overwrite. */
  write(path: string, content: string): WriteResult;

  /** List files, optionally filtered by path prefix. */
  list(prefix?: string): FileEntry[];

  /** Search files for a regex pattern. */
  grep(
    pattern: string,
    path?: string,
    caseSensitive?: boolean,
    maxResults?: number,
  ): GrepResult;

  /** Place a mark on a text span in a file. */
  mark(
    path: string,
    selectedText: string,
    comment: string,
    label?: string,
  ): MarkResult;

  /** Get marks for a file (or all files). */
  getMarks(path?: string): Mark[];

  /** Delete a mark by ID. Returns true if the mark existed. */
  deleteMark(markId: string): boolean;

  /** Get version history for a file. */
  getHistory(path: string): FileVersion[];

  /** Revert a file to a previous version. */
  revert(path: string, versionId: string): boolean;

  /** Get unified diff between two versions (or current if only one specified). */
  diff(path: string, versionA: string, versionB?: string): DiffResult;
}
