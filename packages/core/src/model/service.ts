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
import { HooksManager, OpenRouter, stepCountIs } from "@openrouter/agent";
import { mapNotNullish } from "@std/collections";
import { Context, Effect, Layer, Schema } from "effect";
import type { z } from "zod";
import {
  RETRY_OPTIONS,
  type RepairAttempt,
  type RetryFailure,
  ROUND_RETRY_DELAY_MS,
  type StructuredCall,
  type StructuredCallOptions,
  StructuredParseError,
  type ModelClient as Transport,
} from "@/agent.ts";
import { logger } from "@/logger.ts";
import { isTransientError } from "@/retry_policy.ts";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import { joinBlocks } from "@/text/markdown.ts";
import type { ToolPrompt } from "@/tools/index.ts";
import { delay } from "@/utils/delay.ts";

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
  /** Call the model with tools. Returns the streaming result handle. */
  callModelWithTools(
    input: string,
    toolPrompts: readonly ToolPrompt[],
    models: string[],
    maxRounds?: number,
  ): Effect.Effect<ModelResult<readonly Tool[]>, never>;
}

export class ModelClient extends Context.Service<ModelClient, Interface>()(
  "@essayist/core/model/ModelClient",
) {
  /** Build the service over an explicit transport: tests pass a spy, and
   * the promise bridge composes `layerOpenRouter`. */
  static layerOf(
    transport: Transport,
    sleep: (ms: number) => Promise<void> = delay,
  ): Layer.Layer<ModelClient> {
    return Layer.effect(
      ModelClient,
      Effect.succeed(buildImpl(transport, sleep)),
    );
  }

  /** The OpenRouter transport, configured by the composition root. */
  static layerOpenRouter(apiKey: string): Layer.Layer<ModelClient> {
    return ModelClient.layerOf(new OpenRouter({ apiKey }));
  }
}

/** Attempts at a structured round, counting the first. */
const MAX_ROUND_ATTEMPTS = 3;

function buildImpl(transport: Transport, sleep: (ms: number) => Promise<void>) {
  const callModelStructured = <T extends z.ZodObject<z.ZodRawShape>>(
    input: string,
    schema: T,
    models: string[],
    options?: StructuredCallOptions,
  ): Effect.Effect<
    StructuredCall<z.output<T>>,
    StructuredParseError | ModelCallError
  > =>
    Effect.tryPromise({
      try: async () => {
        const fullInput = `${input}\n\n${generateInstructions(
          schema,
          options,
        )}`;
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

        const first = await structuredRound(
          transport,
          sleep,
          fullInput,
          models,
          hooks,
          options?.onRetry,
        );

        let output: z.output<T>;
        try {
          output = parseStructured(first.text, schema);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const repair: RepairAttempt = { raw: first.text, error: message };
          options?.onRepair?.(repair);
          const retry = await structuredRound(
            transport,
            sleep,
            repairInput(fullInput, first.text, message),
            models,
            hooks,
            options?.onRetry,
          );
          try {
            output = parseStructured(retry.text, schema);
          } catch (retryErr) {
            const retryMessage =
              retryErr instanceof Error ? retryErr.message : String(retryErr);
            options?.onRepair?.({ raw: retry.text, error: retryMessage });
            throw new StructuredParseError(retry.text, retryMessage);
          }
          return {
            output,
            usage: addUsage(first.usage, retry.usage),
            reasoning: mapNotNullish(
              [first, retry],
              (round) => round.reasoning,
            ),
            calls,
            repairs: [repair],
          };
        }

        return {
          output,
          usage: first.usage,
          reasoning: mapNotNullish([first], (round) => round.reasoning),
          calls,
          repairs: [],
        };
      },
      catch: (err) =>
        err instanceof StructuredParseError
          ? err
          : new ModelCallError({ cause: err }),
    });

  const callModelWithTools = (
    input: string,
    toolPrompts: readonly ToolPrompt[],
    models: string[],
    maxRounds = 5,
  ): Effect.Effect<ModelResult<readonly Tool[]>, never> =>
    Effect.sync(() => {
      const tools = toolPrompts.map((tp) => tp.tool);
      const instructions = toolPrompts.map((tp) => tp.instruction).join("\n");
      const fullInput = `${instructions}\n\n${input}`;

      return transport.callModel(
        {
          models,
          input: fullInput,
          tools,
          stopWhen: stepCountIs(maxRounds),
        },
        RETRY_OPTIONS,
      );
    });

  return ModelClient.of({ callModelStructured, callModelWithTools });
}

// The structured round: RETRY_OPTIONS covers a failure before the stream
// starts; a connection dropped mid-stream reaches us as an error from
// getText(), so the round is re-issued here.

async function structuredRound(
  transport: Transport,
  sleep: (ms: number) => Promise<void>,
  input: string,
  models: string[],
  hooks: HooksManager,
  onRetry?: (failure: RetryFailure) => void,
): Promise<{
  text: string;
  usage: SessionUsageTotals;
  reasoning?: string;
}> {
  for (let attempt = 1; ; attempt++) {
    try {
      logger.info({ attempt, models }, "structured call dispatched");
      const result = transport.callModel(
        { models, input, hooks },
        RETRY_OPTIONS,
      );
      const [text, reasoning] = await Promise.all([
        result.getText(),
        collectReasoning(result),
      ]);
      logger.info({ attempt, models }, "structured call settled");
      return { text, usage: await result.getUsage(), reasoning };
    } catch (err) {
      if (attempt >= MAX_ROUND_ATTEMPTS || !isTransientError(err)) throw err;
      const error = err instanceof Error ? err.message : String(err);
      onRetry?.({ attempt, error });
      logger.warn(
        { err, attempt, models: models[0] },
        "structured call failed transiently, retrying",
      );
      await sleep(attempt * ROUND_RETRY_DELAY_MS);
    }
  }
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
