import type {
  DiffResult,
  DraftSnapshot,
  FileEntry,
  FileReadResult,
  FileVersion,
  ReadOptions,
  WriteResult,
} from "@/files/types.ts";
import type {
  Mark,
  MarkOptions,
  MarkResult,
  MigrateMarksResult,
} from "@/marks/types.ts";
import type { GrepOptions, GrepResult } from "@/search/types.ts";

export type {
  DiffResult,
  DraftSnapshot,
  FileEntry,
  FileReadResult,
  FileSnapshot,
  FileVersion,
  ReadOptions,
  WriteResult,
} from "@/files/types.ts";
export type {
  Mark,
  MarkOptions,
  MarkProvenance,
  MarkResult,
  MarkStatus,
  MigrateMarksResult,
} from "@/marks/types.ts";
export type {
  GrepMatch,
  GrepOptions,
  GrepResult,
} from "@/search/types.ts";

/** Which review run and unit placed a mark. */
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
  /**
   * Read file content. By default reads the latest version. Missing files
   * and versions return an empty snapshot with version_id "" (reads never
   * throw by design).
   */
  read(path: string, options?: ReadOptions): Promise<FileReadResult>;

  /**
   * Write new content, creating a new version. Snapshots the old version
   * and migrates its marks to the new version. Clears any pending draft.
   */
  write(path: string, content: string): Promise<WriteResult>;

  /**
   * Writes the mutable draft head. No version, no marks migration.
   * Overwrites any existing draft. Returns the draft snapshot.
   */
  writeDraft(path: string, content: string): Promise<DraftSnapshot>;

  /** Reads the draft head, or null when no draft exists. */
  readDraft(path: string): Promise<DraftSnapshot | null>;

  /**
   * Promotes the draft to a version and clears it.
   */
  promoteDraft(path: string): Promise<WriteResult | null>;

  /** List files, optionally filtered by path prefix. */
  list(prefix?: string): Promise<FileEntry[]>;

  /** Search files for a regex pattern. */
  grep(pattern: string, options?: GrepOptions): Promise<GrepResult>;

  /** Search files for plain text (escaped as literal regex). */
  search(text: string, options?: GrepOptions): Promise<GrepResult>;

  /** Place a mark on a text span; targets the version in options, or latest. */
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

  /**
   * Re-anchor marks from one version onto the latest. Marks whose
   * thread_id is already present on the latest are skipped. No-op when
   * the given version is the latest.
   */
  migrateMarks(
    path: string,
    fromVersionId: string,
  ): Promise<MigrateMarksResult>;

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
