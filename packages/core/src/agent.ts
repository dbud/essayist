import type {
  CallModelInput,
  ModelResult,
  PostModelCallPayload,
  RequestOptions,
  SessionUsageTotals,
  Tool,
  UserPromptSubmitPayload,
} from "@openrouter/agent";
import { HooksManager, OpenRouter, stepCountIs } from "@openrouter/agent";
import { mapNotNullish } from "@std/collections";
import type { z } from "zod";
import { logger } from "@/logger.ts";
import { isTransientError } from "@/retry_policy.ts";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import type { ToolPrompt } from "@/tools/index.ts";
import { delay } from "@/utils/delay.ts";
import { joinBlocks } from "@/utils/text.ts";

// The OpenRouter SDK retries only 5XX by default (retryCodes: ["5XX"]). Free
// upstream providers commonly 429, so opt 429 into the same backoff loop.
// The SDK honors any Retry-After header from OpenRouter, overriding the
// computed interval. This retries pre-stream errors transparently for both
// the initial request and every tool-round follow-up (options are forwarded
// to every betaResponsesSend call inside ModelResult).
export const RETRY_OPTIONS: RequestOptions = {
  timeoutMs: 5 * 60_000,
  retryCodes: ["429", "5XX"],
  retries: {
    strategy: "backoff",
    backoff: {
      initialInterval: 1000,
      maxInterval: 30_000,
      exponent: 2,
      maxElapsedTime: 120_000,
    },
    retryConnectionErrors: true,
  },
};

export class StructuredParseError extends Error {
  constructor(
    public readonly raw: string,
    message: string,
  ) {
    super(message);
  }
}

/** A re-ask: what the model replied, and why it did not fit the schema. */
export interface RepairAttempt {
  /** The reply that was rejected. */
  raw: string;
  /** The validation error, as the model was told it. */
  error: string;
}

/** A failed attempt at a round, and the attempt it was. */
export interface RetryFailure {
  /** Which attempt failed, counting the first. */
  attempt: number;
  error: string;
}

/** Callbacks for watching a structured call as it runs. */
export interface StructuredCallOptions {
  includeExample?: boolean;
  onPrompt?: (text: string) => void;
  onModelCall?: (call: PostModelCallPayload) => void;
  onRepair?: (repair: RepairAttempt) => void;
  onRetry?: (failure: RetryFailure) => void;
}

export interface StructuredCall<T> {
  output: T;
  usage: SessionUsageTotals;
  /** Each call's reasoning, in call order. Empty when none did. */
  reasoning: string[];
  /** Every model call made, in order, including a re-ask. */
  calls: PostModelCallPayload[];
  /** Why each re-ask happened. Empty when the first reply parsed. */
  repairs: RepairAttempt[];
}

export type { PostModelCallPayload, SessionUsageTotals };

export interface ModelClient {
  callModel(
    request: CallModelInput,
    options?: RequestOptions,
  ): ModelResult<readonly Tool[]>;
}

/** Attempts at a structured round, counting the first. */
const MAX_ROUND_ATTEMPTS = 3;
export const ROUND_RETRY_DELAY_MS = 1_000;

export interface AgentOptions {
  sleep?: (ms: number) => Promise<void>;
}

export class Agent {
  #client: ModelClient;
  #sleep: (ms: number) => Promise<void>;

  constructor(
    apiKey: string,
    client: ModelClient = new OpenRouter({ apiKey }),
    options: AgentOptions = {},
  ) {
    this.#client = client;
    this.#sleep = options.sleep ?? delay;
  }

  /**
   * Ask for schema-validated JSON: returns the parsed output with usage
   * and reasoning captured from the response stream. Invalid output
   * triggers one re-ask with the raw reply and the validation error
   * attached; a second failure throws StructuredParseError.
   */
  async callModelStructured<T extends z.ZodObject<z.ZodRawShape>>(
    input: string,
    schema: T,
    models: string[],
    options?: StructuredCallOptions,
  ): Promise<StructuredCall<z.output<T>>> {
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

    const first = await this.#structuredRound(
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
      const repair = { raw: first.text, error: message };
      options?.onRepair?.(repair);
      const retry = await this.#structuredRound(
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
        reasoning: mapNotNullish([first, retry], (round) => round.reasoning),
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
  }

  /**
   * Call the model with tools. Returns the ModelResult for streaming,
   * or await .getText() for the final text.
   */
  callModelWithTools(
    input: string,
    toolPrompts: readonly ToolPrompt[],
    models: string[],
    maxRounds = 5,
  ) {
    const tools = toolPrompts.map((tp) => tp.tool);
    const instructions = toolPrompts.map((tp) => tp.instruction).join("\n");
    const fullInput = `${instructions}\n\n${input}`;

    const request = {
      models,
      input: fullInput,
      tools,
      stopWhen: stepCountIs(maxRounds),
    };

    return this.#client.callModel(request, RETRY_OPTIONS);
  }

  async #structuredRound(
    input: string,
    models: string[],
    hooks: HooksManager,
    onRetry?: (failure: RetryFailure) => void,
  ): Promise<{
    text: string;
    usage: SessionUsageTotals;
    reasoning?: string;
  }> {
    // RETRY_OPTIONS covers a failure before the stream starts. A connection
    // dropped mid-stream reaches us as an error from getText(), so the round
    // is re-issued here.
    for (let attempt = 1; ; attempt++) {
      try {
        logger.info({ attempt, models }, "structured call dispatched");
        const result = this.#client.callModel(
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
        await this.#sleep(attempt * ROUND_RETRY_DELAY_MS);
      }
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
