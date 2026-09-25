import { z } from "zod";

/** The summary a synthesize step produces. */
export const StepSummarySchema = z.object({
  summary: z
    .string()
    .describe("Review summary for the writer, grounded in the provided marks."),
});

export type StepSummary = z.infer<typeof StepSummarySchema>;
