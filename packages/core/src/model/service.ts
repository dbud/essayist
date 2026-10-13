/**
 * The model client as an Effect service: schema-validated structured calls
 * (one repair round, transient retries), wrapped around a transport
 * ({@linkcode Transport}).
 *
 * The workspace context does not apply: model calls carry no workspace
 * state. The transport is injected so tests can spy on the SDK.
 */

import type {
  PostModelCallPayload,
  UserPromptSubmitPayload,
} from "@openrouter/agent";
import { HooksManager, OpenRouter } from "@openrouter/agent";
import { Context, Effect, Layer, Result, Schema } from "effect";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import { joinBlocks } from "@/text/markdown.ts";
import { isTransientError } from "./retry_policy.ts";
import {
  RETRY_OPTIONS,
  type RepairAttempt,
  type RetryFailure,
  ROUND_RETRY_DELAY_MS,
  type StructuredCallOptions,
  StructuredParseError,
  type ModelClient as Transport,
} from "./transport.ts";

/** A call's round retries ran out, or the transport faulted. */
export class ModelCallError extends Schema.TaggedError<ModelCallError>()(
  "ModelCallError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "the model call failed";
  }
}

export interface Interface {
  /**
   * Ask for schema-validated JSON: the parsed output directly, with the
   * prompt, model calls, reasoning, and repairs delivered through the
   * callbacks. Invalid output triggers one re-ask; a second failure fails
   * with {@linkcode StructuredParseError}.
   */
  callModelStructured<T extends Schema.ConstraintDecoder<unknown>>(
    input: string,
    schema: T,
    models: string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<T["Type"], StructuredParseError | ModelCallError>;
}

export class ModelClient extends Context.Service<ModelClient, Interface>()(
  "@essayist/core/model/ModelClient",
) {
  /** Build the service over an explicit transport: tests pass a spy, and
   * the promise bridge composes `layerOpenRouter`. */
  static layerOf(transport: Transport): Layer.Layer<ModelClient> {
    return Layer.effect(ModelClient, Effect.succeed(buildImpl(transport)));
  }

  /** The OpenRouter transport, configured by the composition root. */
  static layerOpenRouter(apiKey: string): Layer.Layer<ModelClient> {
    return ModelClient.layerOf(new OpenRouter({ apiKey }));
  }
}

/** Attempts at a structured round, counting the first. */
const MAX_ROUND_ATTEMPTS = 3;

function buildImpl(transport: Transport) {
  const callModelStructured = <T extends Schema.ConstraintDecoder<unknown>>(
    input: string,
    schema: T,
    models: string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<T["Type"], StructuredParseError | ModelCallError> =>
    Effect.gen(function* () {
      const fullInput = `${input}\n\n${generateInstructions(schema, options)}`;

      const hooks = new HooksManager();
      hooks.on("UserPromptSubmit", {
        handler: (payload: UserPromptSubmitPayload) => {
          options?.onPrompt?.(payload.prompt);
        },
      });
      hooks.on("PostModelCall", {
        handler: (payload: PostModelCallPayload) => {
          options?.onModelCall?.(payload);
        },
      });

      const first = yield* retriedRound(
        transport,
        fullInput,
        models,
        hooks,
        options?.onRetry,
      );
      if (first.reasoning !== undefined) {
        options?.onReasoning?.(first.reasoning);
      }

      const firstParse = parseStructured(first.text, schema);
      if (Result.isSuccess(firstParse)) return firstParse.success;

      const message = describeError(firstParse.failure);
      const repair: RepairAttempt = { raw: first.text, error: message };
      options?.onRepair?.(repair);
      const retry = yield* retriedRound(
        transport,
        repairInput(fullInput, first.text, message),
        models,
        hooks,
        options?.onRetry,
      );
      if (retry.reasoning !== undefined) {
        options?.onReasoning?.(retry.reasoning);
      }

      const retryParse = parseStructured(retry.text, schema);
      if (Result.isFailure(retryParse)) {
        const retryMessage = describeError(retryParse.failure);
        options?.onRepair?.({ raw: retry.text, error: retryMessage });
        return yield* Effect.fail(
          new StructuredParseError(retry.text, retryMessage),
        );
      }
      return retryParse.success;
    });

  return ModelClient.of({ callModelStructured });
}

// The structured round: RETRY_OPTIONS covers a failure before the stream
// starts; a connection dropped mid-stream reaches us as an error from
// getText(), so the round is re-issued through the retry policy. Attempts
// rise to three, spaced linearly in the attempt number.

function roundEffect(
  transport: Transport,
  input: string,
  models: string[],
  hooks: HooksManager,
): Effect.Effect<{ text: string; reasoning?: string }, unknown> {
  return Effect.gen(function* () {
    const result = transport.callModel({ models, input, hooks }, RETRY_OPTIONS);
    const [text, { reasoning, error }] = yield* Effect.tryPromise({
      try: () => Promise.all([result.getText(), collectReasoning(result)]),
      catch: (cause) => cause,
    });
    if (error !== undefined) {
      yield* Effect.logError("reasoning capture failed", {
        error: describeError(error),
      });
    }
    yield* Effect.logInfo("structured call settled", { models });
    return { text, reasoning };
  });
}

function retriedRound(
  transport: Transport,
  input: string,
  models: string[],
  hooks: HooksManager,
  onRetry?: (failure: RetryFailure) => void,
): Effect.Effect<{ text: string; reasoning?: string }, ModelCallError> {
  let attempt = 0;
  return Effect.retry(
    Effect.gen(function* () {
      attempt++;
      yield* Effect.logInfo("structured call dispatched", {
        attempt,
        models,
      });
      return yield* roundEffect(transport, input, models, hooks).pipe(
        // The round's unknown failure becomes a typed fault before the retry
        // policy sees it, so an exhausted retry propagates
        // ModelCallError rather than a defect.
        Effect.mapError((cause) => new ModelCallError({ cause })),
        Effect.tapError((err) =>
          Effect.gen(function* () {
            // The report and the delay cover only the failures that lead to
            // another attempt, like the promise loop did.
            if (isTransientCause(err) && attempt < MAX_ROUND_ATTEMPTS) {
              const error = describeError(err.cause);
              onRetry?.({ attempt, error });
              yield* Effect.logWarning(
                "structured call failed transiently, retrying",
                { attempt, model: models[0], error },
              );
              yield* Effect.sleep(attempt * ROUND_RETRY_DELAY_MS);
            }
          }),
        ),
      );
    }),
    {
      times: MAX_ROUND_ATTEMPTS - 1,
      while: isTransientCause,
    },
  );
}

/** Transiency of the fault the round wrapped, read from its cause. */
function isTransientCause(err: ModelCallError): boolean {
  return isTransientError(err.cause);
}

function describeError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

function parseStructured<T extends Schema.ConstraintDecoder<unknown>>(
  text: string,
  schema: T,
): Result.Result<T["Type"], Error> {
  let json: unknown;
  try {
    json = JSON.parse(stripMarkdownFences(text));
  } catch (cause) {
    return Result.fail(
      cause instanceof Error ? cause : new Error(String(cause)),
    );
  }
  return Schema.decodeUnknownResult(schema)(json);
}

function repairInput(fullInput: string, raw: string, error: string): string {
  return joinBlocks([
    fullInput,
    "Your previous reply was not valid for the schema.",
    "Raw reply:",
    raw,
    `Validation error: ${error}`,
    "Return only one corrected JSON object matching the schema, with no extra text.",
  ]);
}

/** Consume the response stream for reasoning items while getText() runs.
 * Capture failures are reported, not thrown, so a broken stream cannot fail
 * a call whose text was retrieved. */
async function collectReasoning(
  result: Awaited<ReturnType<Transport["callModel"]>>,
): Promise<{ reasoning: string | undefined; error?: unknown }> {
  let reasoning: string | undefined;
  try {
    for await (const event of result.getFullResponsesStream()) {
      if (event.type !== "response.output_item.done") continue;
      const item = event.item;
      if (item.type !== "reasoning") continue;
      const content = (item.content ?? []).map((c) => c.text).join("");
      const summary = item.summary.map((c) => c.text).join("");
      const text = [content, summary].filter(Boolean).join("\n");
      if (!text) continue;
      reasoning = reasoning ? `${reasoning}\n${text}` : text;
    }
  } catch (error) {
    return { reasoning, error };
  }
  return { reasoning };
}
