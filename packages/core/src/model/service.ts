/**
 * The model client as an Effect service: schema-validated structured calls
 * (one repair round, transient retries) and tool calls, wrapped around a
 * transport ({@linkcode Transport}).
 *
 * The workspace context does not apply: model calls carry no workspace
 * state. The transport is injected so tests can spy on the SDK.
 */

import type {
  ModelResult,
  PostModelCallPayload,
  SessionUsageTotals,
  Tool,
  UserPromptSubmitPayload,
} from "@openrouter/agent";
import { HooksManager, OpenRouter } from "@openrouter/agent";
import { mapNotNullish } from "@std/collections";
import { Context, Effect, Layer, Result, Schema } from "effect";
import type { z } from "zod";
import { logger } from "@/logger.ts";
import { isTransientError } from "@/retry_policy.ts";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import { joinBlocks } from "@/text/markdown.ts";
import {
  RETRY_OPTIONS,
  type RepairAttempt,
  type RetryFailure,
  ROUND_RETRY_DELAY_MS,
  type StructuredCall,
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
   * Ask for schema-validated JSON: the parsed output with usage and
   * reasoning captured from the response stream. Invalid output triggers
   * one re-ask; a second failure fails with {@linkcode StructuredParseError}.
   */
  callModelStructured<T extends z.ZodObject<z.ZodRawShape>>(
    input: string,
    schema: T,
    models: string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<
    StructuredCall<z.output<T>>,
    StructuredParseError | ModelCallError
  >;
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
  const callModelStructured = <T extends z.ZodObject<z.ZodRawShape>>(
    input: string,
    schema: T,
    models: string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<
    StructuredCall<z.output<T>>,
    StructuredParseError | ModelCallError
  > =>
    Effect.gen(function* () {
      const fullInput = `${input}\n\n${generateInstructions(schema, options)}`;
      const calls: PostModelCallPayload[] = [];

      const hooks = new HooksManager();
      hooks.on("UserPromptSubmit", {
        handler: (payload: UserPromptSubmitPayload) => {
          options?.onPrompt?.(payload.prompt);
        },
      });
      hooks.on("PostModelCall", {
        handler: (payload: PostModelCallPayload) => {
          calls.push(payload);
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

      const firstParse = yield* Effect.result(
        Effect.try({
          try: () => parseStructured(first.text, schema),
          // The parse failure feeds the repair re-ask and the parse error, so
          // the original message must survive the Effect boundary.
          catch: (cause) => cause,
        }),
      );
      if (Result.isSuccess(firstParse)) {
        return {
          output: firstParse.success,
          usage: first.usage,
          reasoning: mapNotNullish([first], (attempt) => attempt.reasoning),
          calls,
          repairs: [],
        };
      }

      const message =
        firstParse.failure instanceof Error
          ? firstParse.failure.message
          : String(firstParse.failure);
      const repair: RepairAttempt = { raw: first.text, error: message };
      options?.onRepair?.(repair);
      const retry = yield* retriedRound(
        transport,
        repairInput(fullInput, first.text, message),
        models,
        hooks,
        options?.onRetry,
      );
      const retryParse = yield* Effect.result(
        Effect.try({
          try: () => parseStructured(retry.text, schema),
          catch: (cause) => cause,
        }),
      );
      if (Result.isFailure(retryParse)) {
        const retryMessage =
          retryParse.failure instanceof Error
            ? retryParse.failure.message
            : String(retryParse.failure);
        options?.onRepair?.({ raw: retry.text, error: retryMessage });
        return yield* Effect.fail(
          new StructuredParseError(retry.text, retryMessage),
        );
      }
      return {
        output: retryParse.success,
        usage: addUsage(first.usage, retry.usage),
        reasoning: mapNotNullish(
          [first, retry],
          (attempt) => attempt.reasoning,
        ),
        calls,
        repairs: [repair],
      };
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
): Effect.Effect<
  { text: string; usage: SessionUsageTotals; reasoning?: string },
  unknown
> {
  return Effect.gen(function* () {
    const result = transport.callModel({ models, input, hooks }, RETRY_OPTIONS);
    const [text, reasoning] = yield* Effect.tryPromise({
      try: () => Promise.all([result.getText(), collectReasoning(result)]),
      catch: (cause) => cause,
    });
    logger.info({ models }, "structured call settled");
    return {
      text,
      usage: yield* Effect.tryPromise({
        try: () => result.getUsage(),
        catch: (cause) => cause,
      }),
      reasoning,
    };
  });
}

function retriedRound(
  transport: Transport,
  input: string,
  models: string[],
  hooks: HooksManager,
  onRetry?: (failure: RetryFailure) => void,
): Effect.Effect<
  { text: string; usage: SessionUsageTotals; reasoning?: string },
  ModelCallError
> {
  let attempt = 0;
  return Effect.retry(
    Effect.suspend(() => {
      attempt++;
      logger.info({ attempt, models }, "structured call dispatched");
      return roundEffect(transport, input, models, hooks).pipe(
        // The round's unknown failure becomes a typed fault before the
        // retry policy sees it, so an exhausted retry propagates
        // ModelCallError rather than a defect.
        Effect.mapError((cause) => new ModelCallError({ cause })),
        Effect.tapError((err) =>
          Effect.gen(function* () {
            // The report and the delay cover only the failures that lead to
            // another attempt, like the promise loop did.
            if (isTransientCause(err) && attempt < MAX_ROUND_ATTEMPTS) {
              const underlying = err.cause;
              const error =
                underlying instanceof Error
                  ? underlying.message
                  : String(underlying);
              onRetry?.({ attempt, error });
              logger.warn(
                { err: underlying, attempt, models: models[0] },
                "structured call failed transiently, retrying",
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

function parseStructured<T extends z.ZodObject<z.ZodRawShape>>(
  text: string,
  schema: T,
): z.output<T> {
  return schema.parse(JSON.parse(stripMarkdownFences(text)));
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

function addUsage(
  a: SessionUsageTotals,
  b: SessionUsageTotals,
): SessionUsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    modelCalls: a.modelCalls + b.modelCalls,
    ...(a.cost != null || b.cost != null
      ? { cost: (a.cost ?? 0) + (b.cost ?? 0) }
      : {}),
  };
}

/** Consume the response stream for reasoning items while getText() runs. */
async function collectReasoning(
  result: ModelResult<readonly Tool[]>,
): Promise<string | undefined> {
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
  } catch (err) {
    logger.error({ err }, "reasoning capture failed");
  }
  return reasoning;
}
