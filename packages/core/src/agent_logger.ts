import type { CallModelInput, ModelResult, Tool } from "@openrouter/agent";
import { logger } from "./logger.ts";

export function logAgentCall(request: CallModelInput<readonly Tool[]>) {
  const { input } = request;
  logger.debug({ input }, "agent_call");
}

export function logAgentResult(result: ModelResult<readonly Tool[]>) {
  (async () => {
    try {
      for await (const item of result.getItemsStream()) {
        if (item.type === "function_call_output") {
          const { callId, output: outputRaw } = item;
          const output =
            typeof outputRaw === "string" ? JSON.parse(outputRaw) : outputRaw;
          logger.debug({ callId, output }, "function_call_output");
        } else if (
          item.type === "function_call" &&
          item.status === "completed"
        ) {
          const { name: fn, arguments: argString, callId } = item;
          const args = JSON.parse(argString);
          logger.debug({ fn, callId, args }, "function_call");
        } else if (item.type === "message" && item.status === "completed") {
          for (const chunk of item.content) {
            if (chunk.type === "output_text") {
              logger.debug({ text: chunk.text }, "message");
            }
          }
        } else if (item.type === "reasoning" && item.status === "completed") {
          for (const chunk of item.content ?? []) {
            if (chunk.type === "reasoning_text") {
              logger.debug({ text: chunk.text }, "reasoning");
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err }, "logAgentResult error");
    }
  })();
}
