import {
  Agent,
  type ResolvedReviewPass,
  resolveActiveReviewPass,
} from "@essayist/core";
import type { Runtime } from "@/store.ts";

export class ResolveAgentError extends Error {}

/** Resolve the active review pass and the OpenRouter key. Throws
 * ResolveAgentError on no active pass or missing key; config resolution
 * errors propagate as ConfigMissingError / ConfigInvalidError. */
export async function resolveReviewSetup(
  runtime: Runtime,
): Promise<{ pass: ResolvedReviewPass; apiKey: string }> {
  const pass = await runtime.runPromise(resolveActiveReviewPass);
  if (!pass) {
    throw new ResolveAgentError("No active review pass configured.");
  }
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw new ResolveAgentError("OPENROUTER_API_KEY not configured");
  }
  return { pass, apiKey };
}

export async function resolveAgent(
  runtime: Runtime,
): Promise<{ agent: Agent; pass: ResolvedReviewPass }> {
  const { pass, apiKey } = await resolveReviewSetup(runtime);
  return { agent: new Agent(apiKey), pass };
}
