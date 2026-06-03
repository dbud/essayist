import { OpenRouter, stepCountIs } from "@openrouter/agent";
import { z } from "zod";
import { generateInstructions, stripMarkdownFences } from "./schema.ts";
import type { ToolPrompt } from "./tools/index.ts";

const MODEL = "openrouter/owl-alpha";

const modelResponseSchema = z.object({
  success: z.boolean().describe(
    "true if the request was successful, false otherwise",
  ),
  result: z.string().nullable().describe(
    "the answer, or null if success is false",
  ),
  diagnostic: z.string().describe("a short explanation of the result or error"),
});

export type ModelResponse = z.output<typeof modelResponseSchema>;

export class Agent {
  #client: OpenRouter;

  constructor(apiKey: string) {
    this.#client = new OpenRouter({ apiKey });
  }

  async callModel(input: string): Promise<ModelResponse> {
    const fullInput = `${input}\n\n${
      generateInstructions(modelResponseSchema)
    }`;

    console.log(fullInput);
    const result = this.#client.callModel({
      model: MODEL,
      input: fullInput,
    });
    const text = await result.getText();
    console.log(text);
    return modelResponseSchema.parse(JSON.parse(stripMarkdownFences(text)));
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
