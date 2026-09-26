import type { z } from "zod";
import type { Agent, StructuredCall } from "@/agent.ts";
import type { ReviewTraceSink, ReviewTraceUsage } from "@/reviews/types.ts";

/** Events of one structured call, delivered in order. */
export type CallEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "output"; output: unknown }
  | { type: "usage"; usage: ReviewTraceUsage };

/** Options for {@linkcode callStructured}. */
export interface CallStructuredOptions<T extends z.ZodObject<z.ZodRawShape>> {
  agent: Agent;
  /** Delivers the prompt before the call, then the result events. */
  onEvent: (event: CallEvent) => void;
  input: string;
  models: string[];
  schema: T;
}

/** Call the model for a structured output, delivering the prompt before
 * the call and the reasoning, output, and usage after it. */
export async function callStructured<T extends z.ZodObject<z.ZodRawShape>>(
  options: CallStructuredOptions<T>,
): Promise<StructuredCall<z.output<T>>> {
  options.onEvent({ type: "prompt", text: options.input });
  const result = await options.agent.callModelStructured(
    options.input,
    options.schema,
    options.models,
  );
  if (result.reasoning !== undefined) {
    options.onEvent({ type: "reasoning", text: result.reasoning });
  }
  options.onEvent({ type: "output", output: result.output });
  options.onEvent({ type: "usage", usage: result.usage });
  return result;
}

/** Maps call events onto the step-scoped trace events. */
export function stepRecorder(
  sink: ReviewTraceSink,
  stepId: string,
): (event: CallEvent) => void {
  return (event) => {
    switch (event.type) {
      case "prompt":
        sink.record({ type: "step_input", stepId, text: event.text });
        break;
      case "reasoning":
        sink.record({ type: "step_reasoning", stepId, text: event.text });
        break;
      case "output":
        sink.record({ type: "step_output", stepId, output: event.output });
        break;
      case "usage":
        sink.record({ type: "usage", stepId, usage: event.usage });
        break;
    }
  };
}
