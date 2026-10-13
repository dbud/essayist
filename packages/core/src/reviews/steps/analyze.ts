import { Effect, Schema } from "effect";
import type { NodeRunner } from "@/flow/types.ts";
import type { ModelClient } from "@/model/service.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { composeCallInput } from "./input.ts";

export const AnalysisSchema = Schema.Struct({
  thesis: Schema.optionalKey(
    Schema.String.annotate({
      description: "The argument the essay makes, in one or two sentences.",
    }),
  ),
  audience: Schema.optionalKey(
    Schema.String.annotate({
      description:
        "Who the essay is written for, and what it assumes they know.",
    }),
  ),
  claims: Schema.Array(Schema.String).annotate({
    description: "The essay's main assertions, in the order it makes them.",
  }),
  outline: Schema.Array(
    Schema.Struct({
      first_line: Schema.Int.annotate({
        description: "Line number where the section starts.",
      }),
      last_line: Schema.Int.annotate({
        description:
          "Line number where the section ends, before the next begins. The last section ends on the essay's final line.",
      }),
      gist: Schema.String.annotate({
        description: "One sentence on what the section does.",
      }),
    }),
  ).annotate({
    description: "The essay's sections, in order.",
  }),
  strengths: Schema.Array(Schema.String).annotate({
    description: "What the essay does well, with a reference to where.",
  }),
  risks: Schema.Array(Schema.String).annotate({
    description: "Where a skeptical reader may push back, and why.",
  }),
}).annotate({
  examples: [
    {
      thesis: "A first draft is raw material, not a finished essay.",
      claims: ["The draft's value is that it can be honest."],
      outline: [
        { first_line: 3, last_line: 11, gist: "Drafts are raw material." },
      ],
      strengths: ["The opening metaphor carries the whole argument."],
      risks: ["The ending restates the opening rather than closing it."],
    },
  ],
});

export type Analysis = Schema.Schema.Type<typeof AnalysisSchema>;

export const analyzeRunner: NodeRunner<ReviewTypes, "analyze", ModelClient> = {
  execute: ({ prompts, pool }, { inputs, artifact, emit }) =>
    Effect.gen(function* () {
      const result = yield* callStructured({
        onEvent: emit,
        input: composeCallInput(prompts, inputs),
        models: pool.models,
        schema: AnalysisSchema,
        includeExample: true,
      });
      return [artifact("analysis", result)];
    }),
};
