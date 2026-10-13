/**
 * The model client as an Effect service: schema-validated structured calls
 * (a repair round, transient retries) over an OpenRouter chat completion
 * client.
 */

import type { Generated } from "@effect/ai-openrouter";
import {
  OpenRouterClient,
  layer as openRouterClientLayer,
  type Service,
} from "@effect/ai-openrouter/OpenRouterClient";
import {
  Cause,
  Clock,
  Context,
  Effect,
  Layer,
  Redacted,
  Result,
  Schema,
} from "effect";
import { AiError, InvalidOutputError } from "effect/ai/AiError";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import { joinBlocks } from "@/text/markdown.ts";

export interface ModelCallUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  cost?: number;
}

/** A settled model call, for the trace. */
export interface ModelCallRecord {
  /** The model that actually served the reply. */
  model: string;
  durationMs: number;
  usage?: ModelCallUsage;
}

/** A re-ask: what the model replied, and why it did not fit the schema. */
export interface RepairAttempt {
  /** The reply that was rejected. */
  raw: string;
  /** The validation error, included in the re-ask prompt. */
  error: string;
}

/** A failed attempt at a round, and the attempt it was. */
export interface RetryFailure {
  /** Which attempt failed, counting the first. */
  attempt: number;
  error: string;
}

/** Callbacks for watching a structured call as it runs; each delivers the
 * event where it happens. */
export interface StructuredCallOptions {
  includeExample?: boolean;
  onPrompt?: (text: string) => Effect.Effect<void>;
  onModelCall?: (call: ModelCallRecord) => Effect.Effect<void>;
  onReasoning?: (text: string) => Effect.Effect<void>;
  onRepair?: (repair: RepairAttempt) => Effect.Effect<void>;
  onRetry?: (failure: RetryFailure) => Effect.Effect<void>;
}

/** The reply failed the schema twice. */
export class StructuredParseError extends Schema.TaggedError<StructuredParseError>()(
  "StructuredParseError",
  { raw: Schema.String, detail: Schema.String },
) {
  override get message() {
    return this.detail;
  }
}

/** A call's round retries ran out, or the provider faulted. */
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
   * prompt, model calls, reasoning, repairs, and retries delivered through
   * the callbacks. Invalid output triggers a re-ask; a second failure
   * fails with {@linkcode StructuredParseError}.
   */
  callModelStructured<T extends Schema.ConstraintDecoder<unknown>>(
    input: string,
    schema: T,
    models: readonly string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<T["Type"], StructuredParseError | ModelCallError>;
}

export class ModelClient extends Context.Service<ModelClient, Interface>()(
  "@essayist/core/model/ModelClient",
) {
  /** Build the service over an explicit client: tests pass a fake. */
  static layerOf(client: Service): Layer.Layer<ModelClient> {
    return Layer.effect(ModelClient, Effect.succeed(buildImpl(client)));
  }

  /** OpenRouter over the platform fetch client, configured by the
   * composition root. */
  static layerOpenRouter(apiKey: string): Layer.Layer<ModelClient> {
    return Layer.provide(
      Layer.effect(
        ModelClient,
        Effect.gen(function* () {
          return buildImpl(yield* OpenRouterClient);
        }),
      ),
      Layer.provide(
        openRouterClientLayer({ apiKey: Redacted.make(apiKey) }),
        FetchHttpClient.layer,
      ),
    );
  }
}

/** Total attempts at a round, counting the first. */
const MAX_ROUND_ATTEMPTS = 3;

/** The time a single provider request may run before it is failed. */
const ROUND_TIMEOUT_MS = 5 * 60_000;

export const ROUND_RETRY_DELAY_MS = 1_000;

interface Settled {
  text: string;
  reasoning: string | undefined;
  call: ModelCallRecord;
}

function buildImpl(client: Service) {
  const callModelStructured = <T extends Schema.ConstraintDecoder<unknown>>(
    input: string,
    schema: T,
    models: readonly string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<T["Type"], StructuredParseError | ModelCallError> =>
    Effect.gen(function* () {
      const prompt = `${input}\n\n${generateInstructions(schema, options)}`;

      const post = (
        prompt: string,
      ): Effect.Effect<Settled, AiError | Cause.TimeoutError> =>
        Effect.gen(function* () {
          const startedAt = yield* Clock.currentTimeMillis;
          const [body] = yield* client
            .createChatCompletion({
              models,
              messages: [{ role: "user", content: prompt }],
            })
            .pipe(Effect.timeout(ROUND_TIMEOUT_MS));
          const finishedAt = yield* Clock.currentTimeMillis;

          const choice = body.choices[0];
          const text = contentOf(choice?.message);
          if (text === undefined) {
            return yield* Effect.fail(
              new AiError({
                module: "@essayist/core",
                method: "createChatCompletion",
                reason: new InvalidOutputError({
                  description: "the reply carried no message content",
                }),
              }),
            );
          }

          const usage = usageOf(body.usage);
          return {
            text,
            reasoning: choice?.message?.reasoning ?? undefined,
            call: {
              model: body.model,
              durationMs: finishedAt - startedAt,
              ...(usage !== undefined ? { usage } : {}),
            },
          };
        });

      /** Re-issues the round while a later attempt could clear the failure. */
      const attempted = (
        prompt: string,
      ): Effect.Effect<Settled, ModelCallError> =>
        Effect.gen(function* () {
          for (let attempt = 1; ; attempt++) {
            yield* Effect.logInfo("structured call dispatched", {
              attempt,
              models,
            });
            const outcome = yield* Effect.result(post(prompt));
            if (Result.isSuccess(outcome)) {
              yield* Effect.logInfo("structured call settled", { models });
              return outcome.success;
            }
            if (
              !isTransient(outcome.failure) ||
              attempt >= MAX_ROUND_ATTEMPTS
            ) {
              return yield* Effect.fail(
                new ModelCallError({ cause: outcome.failure }),
              );
            }
            const error = describeError(outcome.failure);
            if (options?.onRetry) {
              yield* options.onRetry({ attempt, error });
            }
            yield* Effect.logWarning(
              "structured call failed transiently, retrying",
              { attempt, error },
            );
            yield* Effect.sleep(attempt * ROUND_RETRY_DELAY_MS);
          }
        });

      if (options?.onPrompt) yield* options.onPrompt(prompt);
      const first = yield* attempted(prompt);
      if (options?.onModelCall) yield* options.onModelCall(first.call);
      if (first.reasoning !== undefined && options?.onReasoning) {
        yield* options.onReasoning(first.reasoning);
      }

      const firstParse = parseStructured(first.text, schema);
      if (Result.isSuccess(firstParse)) return firstParse.success;

      const message = describeError(firstParse.failure);
      const repair: RepairAttempt = { raw: first.text, error: message };
      if (options?.onRepair) yield* options.onRepair(repair);
      const repairPrompt = repairInput(prompt, first.text, message);
      if (options?.onPrompt) yield* options.onPrompt(repairPrompt);
      const retry = yield* attempted(repairPrompt);
      if (options?.onModelCall) yield* options.onModelCall(retry.call);
      if (retry.reasoning !== undefined && options?.onReasoning) {
        yield* options.onReasoning(retry.reasoning);
      }

      const retryParse = parseStructured(retry.text, schema);
      if (Result.isFailure(retryParse)) {
        const retryMessage = describeError(retryParse.failure);
        if (options?.onRepair) {
          yield* options.onRepair({ raw: retry.text, error: retryMessage });
        }
        return yield* Effect.fail(
          new StructuredParseError({ raw: retry.text, detail: retryMessage }),
        );
      }
      return retryParse.success;
    });

  return ModelClient.of({ callModelStructured });
}

/** True for a failure a later attempt could clear: the provider errors that
 * say so themselves, and a timed-out request. */
function isTransient(err: unknown): boolean {
  if (err instanceof AiError) return err.isRetryable;
  return Cause.isTimeoutError(err);
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

function repairInput(prompt: string, raw: string, error: string): string {
  return joinBlocks([
    prompt,
    "Your previous reply was not valid for the schema.",
    "Raw reply:",
    raw,
    `Validation error: ${error}`,
    "Return only one corrected JSON object matching the schema, with no extra text.",
  ]);
}

type ChatReply = typeof Generated.SendChatCompletionRequest200.Type;

// Generated reply message content: a plain string, content parts, or null.
function contentOf(
  message: ChatReply["choices"][number]["message"] | undefined,
): string | undefined {
  const content = message?.content;
  if (typeof content === "string") {
    return content === "" ? undefined : content;
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("");
    return text === "" ? undefined : text;
  }
  return undefined;
}

function usageOf(usage: ChatReply["usage"]): ModelCallUsage | undefined {
  if (usage === undefined) return undefined;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    ...(typeof cachedTokens === "number" ? { cachedTokens } : {}),
    ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
    ...(typeof usage.cost === "number" ? { cost: usage.cost } : {}),
  };
}
