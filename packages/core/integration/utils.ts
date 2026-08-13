import { Agent } from "@essayist/core";

/** Models used by integration tests (real OpenRouter calls). */
export const TEST_MODELS = [
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
];

export function createAgent(): Agent | null {
  let apiKey: string | undefined;
  try {
    apiKey = Deno.env.get("OPENROUTER_API_KEY");
  } catch {
    console.warn(
      "No env permission -- skipping integration tests.\n" +
        "Run with --allow-env=OPENROUTER_API_KEY to enable.",
    );
    return null;
  }

  if (!apiKey) {
    console.warn(
      "OPENROUTER_API_KEY not set -- skipping integration tests.\n" +
        "Create a .env file with OPENROUTER_API_KEY=sk-or-... to run these.",
    );
    return null;
  }

  return new Agent(apiKey);
}

export function require<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("value is required but was not provided");
  return value;
}
