import { z } from "zod";

/** The analysis artifact an analyze step produces. */
export const AnalysisSchema = z.object({
  thesis: z.string().optional(),
  audience: z.string().optional(),
  claims: z.string().array(),
  outline: z
    .object({
      first_line: z.number().int(),
      gist: z.string(),
    })
    .array(),
  strengths: z.string().array(),
  risks: z.string().array(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
