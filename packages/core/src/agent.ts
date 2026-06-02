import { OpenRouter } from "@openrouter/sdk";

const MODEL = "openrouter/owl-alpha";

export interface AgentClient {
  callModel(input: string): { getText(): Promise<string> };
}

export function createClient(apiKey: string): AgentClient {
  const client = new OpenRouter({ apiKey });
  return {
    callModel: (input) => client.callModel({ model: MODEL, input }),
  };
}
