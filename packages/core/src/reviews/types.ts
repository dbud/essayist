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
  versionId: Schema.optionalKey(Schema.String),
  status: ReviewRunStatus,
  startedAt: Schema.Number,
  completedAt: Schema.optionalKey(Schema.Number),
  error: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
});

export type ReviewRun = Schema.Schema.Type<typeof ReviewRun>;

/** A proposed mark and its application result. */
export interface MarkAttempt {
  selected_text: string;
  comment: string;
  label?: string;
  line_hint?: number;
  marked: boolean;
  mark_id?: string;
  thread_id?: string;
  error?: string;
}
