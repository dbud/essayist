import { Schema } from "effect";

/** Which review run and unit placed a mark. */
export const MarkProvenance = Schema.Struct({
  runId: Schema.String,
  unitId: Schema.String,
});
export type MarkProvenance = Schema.Schema.Type<typeof MarkProvenance>;

export const MarkStatus = Schema.Literals(["resolved", "stale"]);
export type MarkStatus = Schema.Schema.Type<typeof MarkStatus>;

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
 * Marks are version-bound: each mark belongs to exactly one version. When a new version is created
 * (via write), marks from the previous version are migrated using the mark resolver. If the mark's
 * text can be found in the new content, the mark is copied as "resolved". Otherwise, it is copied
 * as "stale".
 */
export const Mark = Schema.Struct({
  id: Schema.String,
  thread_id: Schema.String, // stable id across versions
  path: Schema.String,
  version_id: Schema.String,
  selected_text: Schema.String,
  before_context: Schema.String,
  after_context: Schema.String,
  comment: Schema.String,
  label: Schema.optionalKey(Schema.String),
  created_at: Schema.Number,
  offset: Schema.Number,
  length: Schema.Number,
  status: MarkStatus,
  meta: Schema.optionalKey(MarkProvenance),
});
export type Mark = Schema.Schema.Type<typeof Mark>;

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
