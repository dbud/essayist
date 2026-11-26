import { ReviewRun } from "@essayist/core";
import { Schema } from "effect";

export type ReviewRunData = typeof ReviewRun.Encoded;

export const ReviewRunsData = Schema.Array(ReviewRun);
export type ReviewRunsData = typeof ReviewRunsData.Encoded;

/**
 * A `progress` stream sends progress and done frames. A `trace` stream also sends the raw trace and
 * is for admins only.
 */
export type ReviewStreamDetail = "progress" | "trace";
