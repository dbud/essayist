import type {
  ModelResult,
  PostModelCallPayload,
  Tool,
} from "@openrouter/agent";
import { HooksManager } from "@openrouter/agent";
import type { ModelClient as Transport } from "@/model/transport.ts";

interface FakeRound {
  text: string;
  reasoning?: string;
}

function fakeResult(round: FakeRound): ModelResult<readonly Tool[]> {
  return {
    getText: () => Promise.resolve(round.text),
    getItemsStream: async function* () {},
    getFullResponsesStream: async function* () {
      if (round.reasoning !== undefined) {
        yield {
          type: "response.output_item.done",
          item: {
            type: "reasoning",
            content: [{ text: round.reasoning }],
            summary: [],
          },
        };
      }
    },
    getUsage: () =>
      Promise.resolve({
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        cachedTokens: 0,
        reasoningTokens: 0,
        modelCalls: 1,
      }),
    cancel: () => {},
  } as unknown as ModelResult<readonly Tool[]>;
}

/** A spy transport that replays the given rounds in order and records the
 * input of every call. Compose it with ModelClient.layerOf in tests. */
export function createSpyTransport(rounds: FakeRound[]): {
  client: Transport;
  inputs: string[];
} {
  const inputs: string[] = [];
  const client: Transport = {
    callModel: (request: { input: string; hooks?: HooksManager }) => {
      inputs.push(request.input);
      const hooks = request.hooks;
      const round = rounds[Math.min(inputs.length - 1, rounds.length - 1)];
      const result = fakeResult(round);
      if (hooks instanceof HooksManager) {
        // The SDK emits UserPromptSubmit from the first stream read, so fire it
        // from getText the way the engine does.
        const getText = result.getText;
        result.getText = () => {
          void hooks.emit("UserPromptSubmit", { prompt: request.input });
          return getText();
        };
        queueMicrotask(() => {
          void hooks.emit("PostModelCall", {
            sessionId: "s",
            responseId: "r",
            model: "m/a",
            durationMs: 1,
            turnType: "initial",
            turnNumber: 1,
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
              cachedTokens: 0,
              reasoningTokens: 0,
            },
          } as PostModelCallPayload);
        });
      }
      return result;
    },
  };
  return { client, inputs };
}
