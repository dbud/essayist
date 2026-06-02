import { OpenRouter } from "@openrouter/sdk";

const MODEL = "openrouter/owl-alpha";

export interface Agent {
  callModel(input: string): { getText(): Promise<string> };
}

export function createAgent(apiKey: string): Agent {
  const client = new OpenRouter({ apiKey });
  return {
    callModel: (input) => client.callModel({ model: MODEL, input }),
  };
}
