import { OpenRouter, stepCountIs } from "@openrouter/agent";
import type { z } from "zod";
import { logAgentCall, logAgentResult } from "@/agent_logger.ts";
import { generateInstructions, stripMarkdownFences } from "@/schema.ts";
import type { ToolPrompt } from "@/tools/index.ts";

const MODELS = [
  "poolside/laguna-m.1:free",
  // "openai/gpt-oss-120b:free",
  // "openrouter/owl-alpha"
];

export class Agent {
  #client: OpenRouter;

  constructor(apiKey: string) {
    this.#client = new OpenRouter({ apiKey });
  }

  async callModel<T extends z.ZodObject<z.ZodRawShape>>(
    input: string,
    schema: T,
    options?: { includeExample?: boolean },
  ): Promise<z.output<T>> {
    const fullInput = `${input}\n\n${generateInstructions(schema, options)}`;

    const result = this.#client.callModel({
      models: MODELS,
      input: fullInput,
    });
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
    const result = this.#client.callModel(request);
    logAgentResult(result);

    return result;
  }
}
