import { OpenRouter, stepCountIs } from "@openrouter/agent";
import type { Tool } from "@openrouter/agent";
import { z } from "zod";
import { generateInstructions, stripMarkdownFences } from "./schema.ts";

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

  /**
   * Call the model with tools. The SDK handles the full tool loop:
   * sends tool definitions to the model, executes tools when called,
   * feeds results back, and repeats until the model produces a final response.
   *
   * @param input - The user prompt
   * @param tools - Array of tools created with `tool()` from `@openrouter/agent`
   * @param maxRounds - Max execution rounds (default: 5). Set to 0 for manual handling.
   */
  async callModelWithTools<TTools extends readonly Tool[]>(
    input: string,
    tools: TTools,
    maxRounds = 5,
  ): Promise<string> {
    const result = this.#client.callModel({
      model: MODEL,
      input,
      tools,
      stopWhen: stepCountIs(maxRounds),
    });
    return await result.getText();
  }
}
