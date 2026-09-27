import { z } from "zod";
import type { Agent } from "@/agent.ts";
import type { NodeRunner } from "@/flow/types.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { renderAnalysis } from "./analyze.ts";
import { composeCallInput } from "./compose.ts";

export const StepSummarySchema = z.object({
  summary: z
    .string()
    .describe("Review summary for the writer, grounded in the provided marks."),
});

export type StepSummary = z.infer<typeof StepSummarySchema>;

export function createSynthesizeRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "synthesize"> {
  return {
    async execute({ prompts, pool }, { inputs, artifact, emit }) {
      const content = inputs.one("content");
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeCallInput(
          prompts,
          inputs.of("analysis").map(renderAnalysis),
          content,
        ),
        models: pool.models,
        schema: StepSummarySchema,
      });
      return [artifact("summary", result.output.summary)];
    },
  };
}
