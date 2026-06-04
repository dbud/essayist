import { OpenRouter, stepCountIs } from "@openrouter/agent";
import { z } from "zod";
import { generateInstructions, stripMarkdownFences } from "./schema.ts";
import type { ToolPrompt } from "./tools/index.ts";

const MODEL = "openrouter/owl-alpha";

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

    console.log(fullInput);
    const result = this.#client.callModel({
      model: MODEL,
      input: fullInput,
    });
    const text = await result.getText();
    console.log(text);
    return schema.parse(JSON.parse(stripMarkdownFences(text)));
  }

  async callModelWithTools(
    input: string,
    toolPrompts: readonly ToolPrompt[],
    maxRounds = 5,
  ): Promise<string> {
    const tools = toolPrompts.map((tp) => tp.tool);
    const instructions = toolPrompts.map((tp) => tp.instruction).join("\n");
    const fullInput = `${instructions}\n\n${input}`;

    const result = this.#client.callModel({
      model: MODEL,
      input: fullInput,
      tools,
      stopWhen: stepCountIs(maxRounds),
    });
    return await result.getText();
  }
}
