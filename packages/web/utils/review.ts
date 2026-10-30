import {
  type ResolvedReviewPass,
  resolveActiveReviewPass,
} from "@essayist/core";
import { env } from "#/env.ts";
import type { Runtime } from "#/store.ts";

export class ResolveReviewError extends Error {}

/** Resolve the active review pass and the OpenRouter key. Throws
 * ResolveReviewError on no active pass or missing key; config resolution
 * errors propagate as ConfigMissingError / ConfigInvalidError. */
export async function resolveReviewSetup(
  runtime: Runtime,
): Promise<{ pass: ResolvedReviewPass; apiKey: string }> {
  const pass = await runtime.runPromise(resolveActiveReviewPass);
  if (!pass) {
    throw new ResolveReviewError("No active review pass configured.");
  }
  const apiKey = env.openrouterApiKey;
  if (!apiKey) {
    throw new ResolveReviewError("OPENROUTER_API_KEY not configured");
  }
  return { pass, apiKey };
}
