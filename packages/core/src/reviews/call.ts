import { Effect, type Schema } from "effect";
import { type ModelCallError, ModelClient } from "@/model/service.ts";
import type {
  PostModelCallPayload,
  StructuredParseError,
} from "@/model/transport.ts";

/** Events of a structured call, delivered in order. */
export type CallEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "repair"; raw: string; error: string }
  | { type: "retry"; attempt: number; error: string }
  | { type: "output"; output: unknown }
  | { type: "model_call"; call: PostModelCallPayload };

/** Options for {@linkcode callStructured}. */
export interface CallStructuredOptions<
  T extends Schema.ConstraintDecoder<unknown>,
> {
  /** Delivers the prompt before the call, then the result events. */
  onEvent: (event: CallEvent) => void;
  input: string;
  models: string[];
  schema: T;
  includeExample?: boolean;
}

/** Call the model for a structured output, delivering a prompt as each call
 * happens, a model_call per call with the reasoning after it, the repairs
 * between calls, then the output. */
export function callStructured<T extends Schema.ConstraintDecoder<unknown>>(
  options: CallStructuredOptions<T>,
): Effect.Effect<
  T["Type"],
  StructuredParseError | ModelCallError,
  ModelClient
> {
  return Effect.gen(function* () {
    const client = yield* ModelClient;
    const output = yield* client.callModelStructured(
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
        onReasoning: (text) => {
          options.onEvent({ type: "reasoning", text });
        },
        onRepair: (repair) => {
          options.onEvent({ type: "repair", ...repair });
        },
        onRetry: (failure) => {
          options.onEvent({ type: "retry", ...failure });
        },
      },
    );
    options.onEvent({ type: "output", output });
    return output;
  });
}
