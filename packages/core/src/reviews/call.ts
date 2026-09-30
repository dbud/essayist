import type { z } from "zod";
import type { Agent, PostModelCallPayload, StructuredCall } from "@/agent.ts";

/** Events of a structured call, delivered in order. */
export type CallEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "output"; output: unknown }
  | { type: "model_call"; call: PostModelCallPayload };

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
 * the call, a model_call as each call happens, then the reasoning and
 * output. */
export async function callStructured<T extends z.ZodObject<z.ZodRawShape>>(
  options: CallStructuredOptions<T>,
): Promise<StructuredCall<z.output<T>>> {
  options.onEvent({ type: "prompt", text: options.input });
  const result = await options.agent.callModelStructured(
    options.input,
    options.schema,
    options.models,
    { onModelCall: (call) => options.onEvent({ type: "model_call", call }) },
  );
  for (const text of result.reasoning) {
    options.onEvent({ type: "reasoning", text });
  }
  options.onEvent({ type: "output", output: result.output });
  return result;
}
