/** Which review run and unit placed a mark. */
export interface MarkProvenance {
  runId: string;
  unitId: string;
}

export type MarkStatus = "resolved" | "stale";

export interface MarkOptions {
  label?: string;
  lineHint?: number;
  threadId?: string;
  contextSpan?: number;
  versionId?: string;
  provenance?: MarkProvenance;
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
  meta?: MarkProvenance;
}

/** Result of a mark operation. */
export interface MarkResult {
  mark_id: string;
  thread_id: string;
  marked: boolean;
}

/** Counts from migrating marks onto the latest version. */
export interface MigrateMarksResult {
  migrated: number;
  stale: number;
}
