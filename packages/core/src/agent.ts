import { OpenRouter, stepCountIs } from "@openrouter/agent";
import type { StreamableOutputItem } from "@openrouter/agent";
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

    const result = this.#client.callModel({
      model: MODEL,
      input: fullInput,
    });
    const text = await result.getText();
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

  /**
   * Stream a chat response, printing text deltas, tool calls, and tool results
   * to the terminal in real time. Returns the final assistant text.
   */
  async streamChat(
    input: string,
    toolPrompts: readonly ToolPrompt[],
    maxRounds = 5,
  ): Promise<string> {
    const tools = toolPrompts.map((tp) => tp.tool);
    const instructions = toolPrompts.map((tp) => tp.instruction).join("\n");
    const fullInput = `${instructions}\n\n${input}`;

    console.log(`[streamChat] input:\n${fullInput}\n`);

    const result = this.#client.callModel({
      model: MODEL,
      input: fullInput,
      tools,
      stopWhen: stepCountIs(maxRounds),
    });

    const items = result.getItemsStream();
    const textStream = result.getTextStream();

    let finalText = "";

    // Consume text stream for the final result
    const textPromise = (async () => {
      for await (const delta of textStream) {
        process.stdout.write(delta);
        finalText += delta;
      }
    })();

    // Consume items stream for tool call / result annotations
    const itemsPromise = (async () => {
      for await (const item of items) {
        this.#printItem(item);
      }
    })();

    await Promise.all([textPromise, itemsPromise]);
    return finalText;
  }

  #printItem(item: StreamableOutputItem): void {
    console.log(JSON.stringify(item));
    switch (item.type) {
      case "function_call": {
        const args = item.arguments ? JSON.stringify(item.arguments) : "{}";
        console.log(`\n  🔧 ${item.name}(${args})`);
        break;
      }
      case "function_call_output": {
        const output = typeof item.output === "string"
          ? item.output
          : JSON.stringify(item.output);
        // Truncate long outputs for readability
        const display = output.length > 200
          ? output.slice(0, 200) + "…"
          : output;
        console.log(`  ✅ → ${display}`);
        break;
      }
      case "reasoning": {
        if (item.summary) {
          console.log(`  💭 ${item.summary}`);
        }
        break;
      }
    }
  }
}
