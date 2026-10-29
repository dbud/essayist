import { ReviewRun } from "@essayist/core";
import { Schema } from "effect";

export const ReviewRunsData = Schema.Struct({ runs: Schema.Array(ReviewRun) });

export type ReviewRunsData = Schema.Schema.Type<typeof ReviewRunsData>;
