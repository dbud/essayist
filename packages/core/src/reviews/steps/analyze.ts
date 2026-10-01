import { z } from "zod";
import type { Agent } from "@/agent.ts";
import type { NodeRunner } from "@/flow/types.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { composeCallInput } from "./input.ts";

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
