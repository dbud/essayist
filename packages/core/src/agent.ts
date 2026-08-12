import type { RequestOptions } from "@openrouter/agent";
import { OpenRouter, stepCountIs } from "@openrouter/agent";
import type { z } from "zod";
import { logAgentCall, logAgentResult } from "@/agent_logger.ts";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import type { ToolPrompt } from "@/tools/index.ts";

const MODELS = [
  // "inclusionai/ling-3.0-tiny:free",
  "poolside/laguna-s-2.1:free",
  // "openai/gpt-oss-120b:free",
];

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

export class Agent {
  #client: OpenRouter;

  constructor(apiKey: string, client: OpenRouter = new OpenRouter({ apiKey })) {
    this.#client = client;
  }

  async callModel<T extends z.ZodObject<z.ZodRawShape>>(
    input: string,
    schema: T,
    options?: { includeExample?: boolean },
  ): Promise<z.output<T>> {
    const fullInput = `${input}\n\n${generateInstructions(schema, options)}`;

    const result = this.#client.callModel(
      {
        models: MODELS,
        input: fullInput,
      },
      RETRY_OPTIONS,
    );
    const text = await result.getText();
    return schema.parse(JSON.parse(stripMarkdownFences(text)));
  }

  /**
   * Call the model with tools. Returns the ModelResult for streaming,
   * or await .getText() for the final text.
   */
  callModelWithTools(
    input: string,
    toolPrompts: readonly ToolPrompt[],
    maxRounds = 5,
  ) {
    const tools = toolPrompts.map((tp) => tp.tool);
    const instructions = toolPrompts.map((tp) => tp.instruction).join("\n");
    const fullInput = `${instructions}\n\n${input}`;

    const request = {
      models: MODELS,
      input: fullInput,
      tools,
      stopWhen: stepCountIs(maxRounds),
    };
    logAgentCall(request);
    const result = this.#client.callModel(request, RETRY_OPTIONS);
    logAgentResult(result);

    return result;
  }
}
