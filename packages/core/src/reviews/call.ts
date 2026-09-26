import type { z } from "zod";
import type { Agent, StructuredCall } from "@/agent.ts";
import type { ReviewTraceSink } from "@/reviews/types.ts";

/** Options for {@linkcode callStructured}. */
export interface CallStructuredOptions<T extends z.ZodObject<z.ZodRawShape>> {
  agent: Agent;
  /** Receives the input, reasoning, output, and usage events. */
  sink: ReviewTraceSink;
  /** Id stamped on the recorded events. */
  stepId: string;
  input: string;
  modelRefs: string[];
  schema: T;
}

/** Call the model for a structured output, recording the input before the
 * call and the reasoning, output, and usage after it. */
export async function callStructured<T extends z.ZodObject<z.ZodRawShape>>(
  options: CallStructuredOptions<T>,
): Promise<StructuredCall<z.output<T>>> {
  options.sink.record({
    type: "step_input",
    stepId: options.stepId,
    text: options.input,
  });
  const result = await options.agent.callModelStructured(
    options.input,
    options.schema,
    options.modelRefs,
  );
  if (result.reasoning !== undefined) {
    options.sink.record({
      type: "step_reasoning",
      stepId: options.stepId,
      text: result.reasoning,
    });
  }
  options.sink.record({
    type: "step_output",
    stepId: options.stepId,
    output: result.output,
  });
  options.sink.record({
    type: "usage",
    stepId: options.stepId,
    usage: result.usage,
  });
  return result;
}
