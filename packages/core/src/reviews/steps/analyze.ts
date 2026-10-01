import { z } from "zod";
import type { Agent } from "@/agent.ts";
import type { NodeRunner } from "@/flow/types.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { composeCallInput } from "./input.ts";

export const AnalysisSchema = z.object({
  thesis: z
    .string()
    .optional()
    .describe("The argument the essay makes, in one or two sentences."),
  audience: z
    .string()
    .optional()
    .describe("Who the essay is written for, and what it assumes they know."),
  claims: z
    .string()
    .array()
    .describe("The essay's main assertions, in the order it makes them."),
  outline: z
    .object({
      first_line: z
        .number()
        .int()
        .describe("Line number where the section starts."),
      last_line: z
        .number()
        .int()
        .describe(
          "Line number where the section ends, before the next begins. The last section ends on the essay's final line.",
        ),
      gist: z.string().describe("One sentence on what the section does."),
    })
    .array()
    .describe("The essay's sections, in order."),
  strengths: z
    .string()
    .array()
    .describe("What the essay does well, with a reference to where."),
  risks: z
    .string()
    .array()
    .describe("Where a skeptical reader may push back, and why."),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export function createAnalyzeRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "analyze"> {
  return {
    async execute({ prompts, pool }, { inputs, artifact, emit }) {
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeCallInput(prompts, inputs),
        models: pool.models,
        schema: AnalysisSchema,
      });
      return [artifact("analysis", result.output)];
    },
  };
}
