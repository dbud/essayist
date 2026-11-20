import { ReviewRun } from "@essayist/core";
import { Schema } from "effect";

export const ReviewRunData = Schema.toEncoded(ReviewRun);
export type ReviewRunData = Schema.Schema.Type<typeof ReviewRunData>;

export const ReviewRunsData = Schema.Array(ReviewRunData);
export type ReviewRunsData = Schema.Schema.Type<typeof ReviewRunsData>;

/**
 * A `progress` stream sends progress and done frames. A `trace` stream also sends the raw trace and
 * is for admins only.
 */
export type ReviewStreamDetail = "progress" | "trace";
