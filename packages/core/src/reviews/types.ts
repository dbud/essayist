import { Schema } from "effect";
import { Model } from "effect/schema";

export const ReviewRunStatus = Schema.Literals(["running", "completed", "failed"]);
export type ReviewRunStatus = Schema.Schema.Type<typeof ReviewRunStatus>;

/** A review pass run over a version of a file. A running run may hold a lease for its driver. */
export class ReviewRun extends Model.Class<ReviewRun>("ReviewRun")({
  id: Model.GeneratedByApp(Schema.String),
  fileId: Schema.String,
  versionId: Schema.String,
  reviewPassId: Schema.String,
  status: ReviewRunStatus,
  startedAt: Model.DateTimeInsert,
  completedAt: Model.FieldOption(Schema.DateTimeUtcFromString),
  error: Model.FieldOption(Schema.String),
  summary: Model.FieldOption(Schema.String),
  leaseOwner: Model.FieldOption(Schema.String),
  heartbeatAt: Model.FieldOption(Schema.DateTimeUtcFromString),
}) {}

export const ReviewRunList = Schema.Array(ReviewRun);

const ProposedMark = {
  selectedText: Schema.String,
  comment: Schema.String,
  label: Schema.optionalKey(Schema.String),
  lineHint: Schema.optionalKey(Schema.Int),
};

export const PlacedMarkAttempt = Schema.Struct({
  ...ProposedMark,
  marked: Schema.Literal(true),
  markId: Schema.String,
});
export type PlacedMarkAttempt = Schema.Schema.Type<typeof PlacedMarkAttempt>;

export const FailedMarkAttempt = Schema.Struct({
  ...ProposedMark,
  marked: Schema.Literal(false),
  error: Schema.String,
});
export type FailedMarkAttempt = Schema.Schema.Type<typeof FailedMarkAttempt>;

/** A proposed mark with its outcome: the id of the placed mark, or why it was not placed. */
export const MarkAttempt = Schema.Union([PlacedMarkAttempt, FailedMarkAttempt]);
export type MarkAttempt = Schema.Schema.Type<typeof MarkAttempt>;
