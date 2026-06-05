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

    const result = this.#client.callModel({
      model: MODEL,
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

    return this.#client.callModel({
      model: MODEL,
      input: fullInput,
      tools,
      stopWhen: stepCountIs(maxRounds),
    });
  }

  /**
   * Stream a chat response as a ReadableStream of SSE events.
   * Yields text deltas, item updates (tool calls, results, reasoning),
   * and a final done event.
   */
  streamChatSSE(
    input: string,
    toolPrompts: readonly ToolPrompt[],
    maxRounds = 5,
  ): ReadableStream<Uint8Array> {
    const result = this.callModelWithTools(input, toolPrompts, maxRounds);
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(
              `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
            ),
          );
        };

        const textPromise = (async () => {
          for await (const delta of result.getTextStream()) {
            send("delta", { delta });
          }
        })();

        const itemsPromise = (async () => {
          for await (const item of result.getItemsStream()) {
            send("item", item);
          }
        })();

        await Promise.all([textPromise, itemsPromise]);
        send("done", {});
        controller.close();
      },
      async cancel() {
        await result.cancel();
      },
    });
  }
}
