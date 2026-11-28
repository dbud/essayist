import { Mark } from "@essayist/core";
import { Schema } from "effect";

export const MarkData = Mark.json;
export type MarkData = typeof MarkData.Encoded;

export const MarksData = Schema.Array(MarkData);
export type MarksData = typeof MarksData.Encoded;

/**
 * The review a version shows: its marks, and the content of the version it read, for anchoring the
 * marks onto other text. Null before the first review.
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
