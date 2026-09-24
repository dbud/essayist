import type {
  CallModelInput,
  ModelResult,
  RequestOptions,
  SessionUsageTotals,
  Tool,
} from "@openrouter/agent";
import { OpenRouter, stepCountIs } from "@openrouter/agent";
import type { z } from "zod";
import { logAgentCall } from "@/agent_logger.ts";
import { logger } from "@/logger.ts";
import type { ReviewTraceUsage } from "@/reviews/types.ts";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import type { ToolPrompt } from "@/tools/index.ts";

// The OpenRouter SDK retries only 5XX by default (retryCodes: ["5XX"]). Free
// upstream providers commonly 429, so opt 429 into the same backoff loop.
// The SDK honors any Retry-After header from OpenRouter, overriding the
// computed interval. This retries pre-stream errors transparently for both
// the initial request and every tool-round follow-up (options are forwarded
// to every betaResponsesSend call inside ModelResult).
export const RETRY_OPTIONS: RequestOptions = {
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

export interface StructuredCall<T> {
  output: T;
  usage: ReviewTraceUsage;
  reasoning?: string;
}

export interface ModelClient {
  callModel(
    request: CallModelInput,
    options?: RequestOptions,
  ): ModelResult<readonly Tool[]>;
}

export class Agent {
  #client: ModelClient;

  constructor(
    apiKey: string,
    client: ModelClient = new OpenRouter({ apiKey }),
  ) {
    this.#client = client;
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
    options?: { includeExample?: boolean },
  ): Promise<StructuredCall<z.output<T>>> {
    const fullInput = `${input}\n\n${generateInstructions(schema, options)}`;

    const first = await this.#structuredRound(fullInput, models);

    let output: z.output<T>;
    try {
      output = parseStructured(first.text, schema);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retry = await this.#structuredRound(
        repairInput(fullInput, first.text, message),
        models,
      );
      try {
        output = parseStructured(retry.text, schema);
      } catch (retryErr) {
        const retryMessage =
          retryErr instanceof Error ? retryErr.message : String(retryErr);
        throw new StructuredParseError(retry.text, retryMessage);
      }
      return {
        output,
        usage: addUsage(first.usage, retry.usage),
        reasoning: joinReasoning(first.reasoning, retry.reasoning),
      };
    }

    return {
      output,
      usage: first.usage,
      reasoning: first.reasoning,
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
    logAgentCall(request);

    return this.#client.callModel(request, RETRY_OPTIONS);
  }

  async #structuredRound(
    input: string,
    models: string[],
  ): Promise<{
    text: string;
    usage: ReviewTraceUsage;
    reasoning?: string;
  }> {
    const result = this.#client.callModel({ models, input }, RETRY_OPTIONS);
    const [text, reasoning] = await Promise.all([
      result.getText(),
      collectReasoning(result),
    ]);
    const usage = mapUsage(await result.getUsage());
    return { text, usage, reasoning };
  }
}

function parseStructured<T extends z.ZodObject<z.ZodRawShape>>(
  text: string,
  schema: T,
): z.output<T> {
  return schema.parse(JSON.parse(stripMarkdownFences(text)));
}

function repairInput(fullInput: string, raw: string, error: string): string {
  return [
    fullInput,
    "Your previous reply was not valid for the schema.",
    "Raw reply:",
    raw,
    `Validation error: ${error}`,
    "Return only one corrected JSON object matching the schema, with no extra text.",
  ].join("\n\n");
}

function joinReasoning(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return `${a}\n${b}`;
}

function addUsage(a: ReviewTraceUsage, b: ReviewTraceUsage): ReviewTraceUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    ...(a.cost != null || b.cost != null
      ? { cost: (a.cost ?? 0) + (b.cost ?? 0) }
      : {}),
  };
}

function mapUsage(usage: SessionUsageTotals): ReviewTraceUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cachedTokens: usage.cachedTokens,
    reasoningTokens: usage.reasoningTokens,
    ...(usage.cost != null ? { cost: usage.cost } : {}),
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
