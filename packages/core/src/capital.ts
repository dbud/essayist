import type { Agent } from "./agent.ts";
import { z } from "zod";

const capitalResponseSchema = z.object({
  success: z.boolean().describe(
    "true if the request was successful, false otherwise",
  ).meta({ example: true }),
  result: z.string().nullable().describe(
    "the answer, or null if success is false",
  ).meta({ example: "Paris" }),
  diagnostic: z.string().describe("a short explanation of the result or error")
    .meta({ example: "Found capital" }),
});

export type CapitalResponse = z.output<typeof capitalResponseSchema>;

export async function getCapital(
  country: string,
  client: Agent,
): Promise<string> {
  const response: CapitalResponse = await client.callModel(
    `What is the capital of ${country}?`,
    capitalResponseSchema,
    { includeExample: true },
  );

  if (!response.success) {
    throw new Error(`Model returned failure: ${response.diagnostic}`);
  }

  return response.result ?? "unknown";
}
