import {
  Agent,
  type ConfigStore,
  type ResolvedReviewPass,
} from "@essayist/core";

export class ResolveAgentError extends Error {}

/** Resolve the active review pass and construct an Agent. Throws ResolveAgentError on missing config or API key. */
export async function resolveAgent(
  config: ConfigStore,
): Promise<{ agent: Agent; pass: ResolvedReviewPass }> {
  const pass = await config.resolveActiveReviewPass();
  if (!pass) {
    throw new ResolveAgentError("No active review pass configured.");
  }
  const apiKey = Deno.env.get(pass.apiKeyEnvKey);
  if (!apiKey) {
    throw new ResolveAgentError(`${pass.apiKeyEnvKey} not configured`);
  }
  return { agent: new Agent(apiKey), pass };
}
