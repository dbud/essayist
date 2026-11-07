import { Schema } from "effect";
import { Model } from "effect/schema";

export const ReviewRunStatus = Schema.Literals(["running", "completed", "failed"]);
export type ReviewRunStatus = Schema.Schema.Type<typeof ReviewRunStatus>;

/** A review pass run over a file in a workspace. The nullable fields are select-only: the storage
 * layer writes them in its claim, heartbeat, and settle statements.
 */
export class ReviewRun extends Model.Class<ReviewRun>("ReviewRun")({
  id: Schema.String,
  wsId: Schema.String,
  path: Schema.String,
  reviewPassId: Schema.String,
  versionId: Schema.String,
  status: ReviewRunStatus,
  startedAt: Schema.Number,
  completedAt: Model.FieldOnly(["select"])(Schema.OptionFromNullOr(Schema.Number)),
  error: Model.FieldOnly(["select"])(Schema.OptionFromNullOr(Schema.String)),
  summary: Model.FieldOnly(["select"])(Schema.OptionFromNullOr(Schema.String)),
  leaseOwner: Model.FieldOnly(["select"])(Schema.OptionFromNullOr(Schema.String)),
  heartbeatAt: Model.FieldOnly(["select"])(Schema.OptionFromNullOr(Schema.Number)),
}) {}

export const ReviewRunList = Schema.Array(ReviewRun);

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
