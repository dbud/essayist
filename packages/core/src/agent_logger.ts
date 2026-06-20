import type { CallModelInput, ModelResult, Tool } from "@openrouter/agent";
import { logger } from "./logger.ts";

export async function logAgentCall(request: CallModelInput<readonly Tool[]>) {
  const { input } = request;
  const l = await logger();
  l.debug({ input }, "agent_call");
}

export function logAgentResult(result: ModelResult<readonly Tool[]>) {
  (async () => {
    try {
      const l = await logger();
      for await (const item of result.getItemsStream()) {
        if (item.type === "function_call_output") {
          const { callId, output: outputRaw } = item;
          const output =
            typeof outputRaw === "string" ? JSON.parse(outputRaw) : outputRaw;
          l.debug({ callId, output }, "function_call_output");
        } else if (
          item.type === "function_call" &&
          item.status === "completed"
        ) {
          const { name: fn, arguments: argString, callId } = item;
          const args = JSON.parse(argString);
          l.debug({ fn, callId, args }, "function_call");
        } else if (item.type === "message" && item.status === "completed") {
          for (const chunk of item.content) {
            if (chunk.type === "output_text") {
              l.debug({ text: chunk.text }, "message");
            }
          }
        } else if (item.type === "reasoning" && item.status === "completed") {
          for (const chunk of item.content ?? []) {
            if (chunk.type === "reasoning_text") {
              l.debug({ text: chunk.text }, "reasoning");
            }
          }
        }
      }
    } catch (err) {
      const l = await logger();
      l.error({ err }, "logAgentResult error");
    }
  })();
}
