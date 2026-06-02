import type { AgentClient } from "./agent.ts";

export async function getCapital(
  country: string,
  client: AgentClient,
): Promise<string> {
  const result = client.callModel(
    `What is the capital of ${country}? Respond with only the city name.`,
  );
  return await result.getText();
}
