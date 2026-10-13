import { Effect, type Schema } from "effect";
import {
  type ModelCallError,
  type ModelCallRecord,
  ModelClient,
  type StructuredParseError,
} from "@/model/service.ts";

/** Events of a structured call, delivered in order. */
export type CallEvent =
  | { type: "prompt"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "repair"; raw: string; error: string }
  | { type: "retry"; attempt: number; error: string }
  | { type: "output"; output: unknown }
  | { type: "model_call"; call: ModelCallRecord };

export interface CallStructuredOptions<
  T extends Schema.ConstraintDecoder<unknown>,
> {
  onEvent: (event: CallEvent) => Effect.Effect<void>;
  input: string;
  models: string[];
  schema: T;
  includeExample?: boolean;
}

/** Call the model for a structured output, delivering the events to
 * onEvent as they happen and ending with the output event. */
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
        onPrompt: (text) => options.onEvent({ type: "prompt", text }),
        onModelCall: (call) => options.onEvent({ type: "model_call", call }),
        onReasoning: (text) => options.onEvent({ type: "reasoning", text }),
        onRepair: (repair) => options.onEvent({ type: "repair", ...repair }),
        onRetry: (failure) => options.onEvent({ type: "retry", ...failure }),
      },
    );
    yield* options.onEvent({ type: "output", output });
    return output;
  });
}
