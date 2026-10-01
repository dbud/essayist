import {
  Agent,
  type ConfigStore,
  type ResolvedReviewPass,
  resolveActiveReviewPass,
} from "@essayist/core";

export class ResolveAgentError extends Error {}

// Resolve the active review pass and construct an Agent. Throws
// ResolveAgentError on no active pass or missing API key; config
// resolution errors propagate as ConfigMissingError / ConfigInvalidError.
export async function resolveAgent(
  config: ConfigStore,
): Promise<{ agent: Agent; pass: ResolvedReviewPass }> {
  const pass = await resolveActiveReviewPass(config);
  if (!pass) {
    throw new ResolveAgentError("No active review pass configured.");
  }
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new ResolveAgentError("OPENROUTER_API_KEY not configured");
  }
  return { agent: new Agent(apiKey), pass };
}
