import { Schema } from "effect";

import { Lease } from "#/persistence/mod.ts";

export const ReviewRunStatus = Schema.Literals(["running", "completed", "failed"]);
export type ReviewRunStatus = Schema.Schema.Type<typeof ReviewRunStatus>;

/** A review pass run over a file in a workspace. The lease fields ride along while a driver claims
 * the run and are stripped once it settles. */
export const ReviewRun = Schema.Struct({
  ...Lease.fields,
  id: Schema.String,
  wsId: Schema.String,
  path: Schema.String,
  reviewPassId: Schema.String,
  versionId: Schema.String,
  status: ReviewRunStatus,
  startedAt: Schema.Number,
  completedAt: Schema.optionalKey(Schema.Number),
  error: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
});

export type ReviewRun = Schema.Schema.Type<typeof ReviewRun>;

/** A proposed mark and its application result. */
export const MarkAttempt = Schema.Struct({
  selected_text: Schema.String,
  comment: Schema.String,
  label: Schema.optionalKey(Schema.String),
  line_hint: Schema.optionalKey(Schema.Int),
  marked: Schema.Boolean,
  mark_id: Schema.optionalKey(Schema.String),
  thread_id: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.String),
});
export type MarkAttempt = Schema.Schema.Type<typeof MarkAttempt>;
