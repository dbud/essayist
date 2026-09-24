import { mapNotNullish, partition, zip } from "@std/collections";
import type { ConfigStore } from "./store.ts";
import { renderPrompt } from "./template.ts";
import type {
  Category,
  ModelPool,
  ResolvedReviewPass,
  ResolvedStep,
  ReviewPass,
  Step,
} from "./types.ts";

const DEFAULT_API_KEY_ENV = "OPENROUTER_API_KEY";

/** Thrown by resolution on config entities the pass references but that are missing. */
export class ConfigMissingError extends Error {
  constructor(what: string) {
    super(`Config missing: ${what}`);
  }
}

/** Thrown by resolution on a structurally invalid pass. */
export class ConfigInvalidError extends Error {
  constructor(what: string) {
    super(`Config invalid: ${what}`);
  }
}

/**
 * Resolve the active review pass into a ResolvedReviewPass bundle.
 * Returns undefined if none is pinned.
 */
export async function resolveActiveReviewPass(
  store: ConfigStore,
): Promise<ResolvedReviewPass | undefined> {
  const activeId = await store.getActiveReviewPassId();
  if (!activeId) return undefined;

  const pass = await store.getReviewPass(activeId);
  if (!pass) throw new ConfigMissingError(`review pass "${activeId}"`);
  return resolveReviewPass(store, pass);
}

/**
 * Resolve a pass's steps in order: render prompts with the pass variables,
 * resolve each step's model pool (step override or pass default), and
 * resolve categories for mark steps. Steps resolve concurrently.
 */
export async function resolveReviewPass(
  store: ConfigStore,
  pass: ReviewPass,
): Promise<ResolvedReviewPass> {
  assertStepOrder(pass);
  const vars = pass.variables ?? {};
  const steps = await Promise.all(
    pass.steps.map((step) => resolveStep(store, pass, step, vars)),
  );
  return { pass, steps };
}

function assertStepOrder(pass: ReviewPass): void {
  const seen = new Set<string>();
  for (const step of pass.steps) {
    if (seen.has(step.id)) {
      throw new ConfigInvalidError(
        `step id "${step.id}" is used more than once in pass "${pass.id}"`,
      );
    }
    for (const ref of step.artifactsFromStepIds ?? []) {
      if (!seen.has(ref)) {
        throw new ConfigInvalidError(
          `step "${step.id}" in pass "${pass.id}" references unknown or later step "${ref}"`,
        );
      }
    }
    seen.add(step.id);
  }
}

async function resolveStep(
  store: ConfigStore,
  pass: ReviewPass,
  step: Step,
  vars: Record<string, string>,
): Promise<ResolvedStep> {
  const [systemPrompt, directive, instructions, pool, categories] =
    await Promise.all([
      renderStepPrompt(store, pass, step, step.systemPromptKey, vars),
      renderStepPrompt(store, pass, step, step.directivePromptKey, vars),
      resolveInstructions(store, pass, step, vars),
      resolveStepPool(store, pass, step),
      resolveStepCategories(store, pass, step),
    ]);

  return {
    step,
    modelRefs: pool.models,
    apiKeyEnvKey: pool.apiKeyEnvKey ?? DEFAULT_API_KEY_ENV,
    systemPrompt,
    directive,
    instructions,
    categories,
    allowedLabels: categories.map((c) => c.label),
  };
}

async function resolveInstructions(
  store: ConfigStore,
  pass: ReviewPass,
  step: Step,
  vars: Record<string, string>,
): Promise<string> {
  if (!step.instructionsPromptKey) return "";
  return await renderStepPrompt(
    store,
    pass,
    step,
    step.instructionsPromptKey,
    vars,
  );
}

async function renderStepPrompt(
  store: ConfigStore,
  pass: ReviewPass,
  step: Step,
  key: string,
  vars: Record<string, string>,
): Promise<string> {
  const prompt = await store.getPrompt(key);
  if (!prompt) {
    throw new ConfigMissingError(
      `prompt "${key}" for step "${step.id}" in pass "${pass.id}"`,
    );
  }
  return renderPrompt(prompt.body, vars);
}

async function resolveStepPool(
  store: ConfigStore,
  pass: ReviewPass,
  step: Step,
): Promise<ModelPool> {
  const poolId = step.modelPoolId ?? pass.modelPoolId;
  const pool = await store.getModelPool(poolId);
  if (!pool) throw new ConfigMissingError(`model pool "${poolId}"`);
  if (pool.models.length === 0) {
    throw new ConfigMissingError(`model pool "${pool.id}" has no models`);
  }
  return pool;
}

async function resolveStepCategories(
  store: ConfigStore,
  pass: ReviewPass,
  step: Step,
): Promise<Category[]> {
  if (step.kind !== "mark") {
    if (step.allowedCategoryIds?.length) {
      throw new ConfigInvalidError(
        `step "${step.id}" in pass "${pass.id}" is ${step.kind} but sets allowedCategoryIds`,
      );
    }
    if (step.repairRounds !== undefined) {
      throw new ConfigInvalidError(
        `step "${step.id}" in pass "${pass.id}" is ${step.kind} but sets repairRounds`,
      );
    }
    return [];
  }

  const ids = step.allowedCategoryIds ?? [];
  if (ids.length === 0) {
    throw new ConfigInvalidError(
      `mark step "${step.id}" in pass "${pass.id}" has no allowed categories`,
    );
  }
  const categories = await store.getCategories(ids);
  const [present, missing] = partition(
    zip(ids, categories),
    ([, category]) => category !== undefined,
  );
  if (missing.length > 0) {
    throw new ConfigMissingError(
      `categories ${missing.map(([id]) => `"${id}"`).join(", ")} for step "${step.id}" in pass "${pass.id}"`,
    );
  }
  return mapNotNullish(present, ([, category]) => category);
}
