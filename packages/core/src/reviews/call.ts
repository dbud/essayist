import type { z } from "zod";
import type { Agent, PostModelCallPayload, StructuredCall } from "@/agent.ts";

/** Events of a structured call, delivered in order. */
export type CallEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "repair"; raw: string; error: string }
  | { type: "retry"; attempt: number; error: string }
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
  includeExample?: boolean;
}

/** Call the model for a structured output, delivering a prompt as each call
 * happens, a model_call per call, the repairs between them, then the
 * reasoning and output. */
export async function callStructured<T extends z.ZodObject<z.ZodRawShape>>(
  options: CallStructuredOptions<T>,
): Promise<StructuredCall<z.output<T>>> {
  const result = await options.agent.callModelStructured(
    options.input,
    options.schema,
    options.models,
    {
      includeExample: options.includeExample,
      onPrompt: (text) => {
        options.onEvent({ type: "prompt", text });
      },
      onModelCall: (call) => {
        options.onEvent({ type: "model_call", call });
      },
      onRepair: (repair) => {
        options.onEvent({ type: "repair", ...repair });
      },
      onRetry: (failure) => {
        options.onEvent({ type: "retry", ...failure });
      },
    },
  );
  for (const text of result.reasoning) {
    options.onEvent({ type: "reasoning", text });
  }
  options.onEvent({ type: "output", output: result.output });
  return result;
}
