import { z } from "zod";
import type { Agent } from "@/agent.ts";
import type { NodeRunner } from "@/flow/types.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { joinBlocks, joinLines, listOf, section } from "@/utils/text.ts";
import { composeCallInput } from "./compose.ts";

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

// TODO -- when a second artifact shape is needed, turn this renderer and
// AnalysisSchema into named (schema, renderer) profiles selected per step.
export function renderAnalysis(analysis: Analysis): string {
  return joinBlocks(
    section("Analysis"),
    joinLines(
      analysis.thesis && `Thesis: ${analysis.thesis}`,
      analysis.audience && `Audience: ${analysis.audience}`,
      listOf("Claims, in order:", analysis.claims, { numbered: true }),
      listOf(
        "Outline:",
        analysis.outline.map(
          (entry) => `line ${entry.first_line}: ${entry.gist}`,
        ),
      ),
      listOf("Strengths:", analysis.strengths),
      listOf("Where a skeptical reader may resist:", analysis.risks),
    ),
  );
}

/** Analyzes the essay with a structured call. */
export function createAnalyzeRunner(
  agent: Agent,
): NodeRunner<ReviewTypes, "analyze"> {
  return {
    async execute(prompts, { inputs, artifact, emit }) {
      const content = inputs.one("content");
      const result = await callStructured({
        agent,
        onEvent: emit,
        input: composeCallInput(
          prompts,
          inputs.of("analysis").map(renderAnalysis),
          content,
        ),
        models: prompts.models,
        schema: AnalysisSchema,
      });
      return [artifact("analysis", result.output)];
    },
  };
}
