import { Mark } from "@essayist/core";
import { Schema } from "effect";

export const MarksData = Schema.Array(Mark.json);

export type MarksData = typeof MarksData.Encoded;

/**
 * The latest completed review of a file: its marks, and the content of the version it read, for
 * anchoring the marks again onto newer text. Null before the first review completes.
 */
export const LatestReviewData = Schema.NullOr(
  Schema.Struct({
    runId: Schema.String,
    versionId: Schema.String,
    content: Schema.String,
    marks: MarksData,
  }),
);

export type LatestReviewData = typeof LatestReviewData.Encoded;
