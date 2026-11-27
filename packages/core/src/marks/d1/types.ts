import { Schema } from "effect";
import { Model } from "effect/schema";

/**
 * A review comment on a text span, placed by a review run on the version that run reviews. A mark
 * is written once and never changes; the editor anchors it again onto newer text as it is edited.
 */
export class Mark extends Model.Class<Mark>("Mark")({
  id: Model.GeneratedByApp(Schema.String),
  runId: Schema.String,
  categoryId: Model.FieldOption(Schema.String),
  selectedText: Schema.String,
  beforeContext: Schema.String,
  afterContext: Schema.String,
  comment: Schema.String,
  createdAt: Model.DateTimeInsert,
  offset: Schema.Int,
  length: Schema.Int,
}) {}

/** The text of a mark does not appear in the version it was to be placed on. */
export class MarkTextNotFoundError extends Schema.TaggedError<MarkTextNotFoundError>()(
  "MarkTextNotFoundError",
  { selectedText: Schema.String },
) {
  override get message() {
    return "selected text not found";
  }
}
