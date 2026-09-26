import type { ModelResult, Tool } from "@openrouter/agent";
import { Agent, type ModelClient } from "@/agent.ts";

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

/** An agent over a spy client that replays the given rounds in order and
 * records the input of every call. */
export function createSpyClient(rounds: FakeRound[]): {
  agent: Agent;
  inputs: string[];
} {
  const inputs: string[] = [];
  const client: ModelClient = {
    callModel: (request: { input: string }) => {
      inputs.push(request.input);
      return fakeResult(rounds[Math.min(inputs.length - 1, rounds.length - 1)]);
    },
  };
  return { agent: new Agent("test-key", client), inputs };
}
