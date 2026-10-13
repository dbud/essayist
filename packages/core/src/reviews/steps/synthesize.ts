import { Effect, Schema } from "effect";
import type { NodeRunner } from "@/flow/types.ts";
import type { ModelClient } from "@/model/service.ts";
import { callStructured } from "@/reviews/call.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { composeCallInput } from "./input.ts";

export const StepSummarySchema = Schema.Struct({
  summary: Schema.String.annotate({
    description:
      "Review summary for the writer, grounded in the provided marks.",
  }),
});

export type StepSummary = Schema.Schema.Type<typeof StepSummarySchema>;

export const synthesizeRunner: NodeRunner<
  ReviewTypes,
  "synthesize",
  ModelClient
> = {
  execute: ({ prompts, pool }, { inputs, artifact, emit }) =>
    Effect.gen(function* () {
      const result = yield* callStructured({
        onEvent: emit,
        input: composeCallInput(prompts, inputs),
        models: pool.models,
        schema: StepSummarySchema,
      });
      return [artifact("summary", result.summary)];
    }),
};
