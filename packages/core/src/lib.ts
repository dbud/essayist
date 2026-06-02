import type { Agent, ModelResponse } from "./agent.ts";

export async function getCapital(
  country: string,
  client: Agent,
): Promise<string> {
  const response: ModelResponse = await client.callModel(
    `What is the capital of ${country}?`,
  );

  if (!response.success) {
    throw new Error(`Model returned failure: ${response.diagnostic}`);
  }

  return response.result ?? "unknown";
}
