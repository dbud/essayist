import { renderCategories } from "@/reviews/steps/input.ts";
import type { ConfigStore } from "./store.ts";
import { renderTemplate } from "./template.ts";
import type {
  Category,
  ModelPool,
  ResolvedReviewPass,
  ResolvedReviewUnit,
  ReviewPass,
  ReviewUnit,
} from "./types.ts";

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
 * Resolve a pass's units in order: render the shared system prompt and
 * each unit's prompts with the pass variables, resolve each unit's model
 * pool (unit override or pass default), and resolve categories for attempt
 * units. Units resolve concurrently.
 */
export async function resolveReviewPass(
  store: ConfigStore,
  pass: ReviewPass,
): Promise<ResolvedReviewPass> {
  assertUnitOrder(pass);
  const vars = pass.variables ?? {};
  const system = await renderPromptKey(
    store,
    pass.systemPromptKey,
    vars,
    `pass "${pass.id}"`,
  );
  const units = await Promise.all(
    pass.units.map((unit) => resolveUnit(store, pass, unit, system, vars)),
  );
  return { pass, units };
}

function assertUnitOrder(pass: ReviewPass): void {
  const seen = new Set<string>();
  for (const unit of pass.units) {
    if (unit.id.includes(".")) {
      throw new ConfigInvalidError(
        `unit id "${unit.id}" in pass "${pass.id}" must not contain ".", which is reserved for derived node ids`,
      );
    }
    if (seen.has(unit.id)) {
      throw new ConfigInvalidError(
        `unit id "${unit.id}" is used more than once in pass "${pass.id}"`,
      );
    }
    for (const ref of unit.inputs ?? []) {
      if (!seen.has(ref)) {
        throw new ConfigInvalidError(
          `unit "${unit.id}" in pass "${pass.id}" references unknown or later unit "${ref}"`,
        );
      }
    }
    seen.add(unit.id);
  }
}

async function resolveUnit(
  store: ConfigStore,
  pass: ReviewPass,
  unit: ReviewUnit,
  system: string,
  vars: Record<string, string>,
): Promise<ResolvedReviewUnit> {
  if (unit.attempt && unit.summary) {
    // TODO -- a unit could both place marks and summarize them; exclusive
    // until a pass needs it.
    throw new ConfigInvalidError(
      `unit "${unit.id}" in pass "${pass.id}" sets both attempt and summary`,
    );
  }
  const [directive, instructions, pool, attempt] = await Promise.all([
    renderUnitPrompt(store, pass, unit, unit.promptKey, vars),
    resolveUnitInstructions(store, pass, unit, vars),
    resolveUnitPool(store, pass, unit),
    resolveUnitAttempt(store, pass, unit),
  ]);

  return {
    id: unit.id,
    prompts: {
      system,
      directive,
      instructions,
      categories: renderCategories(attempt?.categories ?? []) ?? "",
    },
    pool,
    inputs: unit.inputs ?? [],
    ...(attempt && { attempt }),
    ...(unit.summary && { summary: true }),
  };
}

async function renderUnitPrompt(
  store: ConfigStore,
  pass: ReviewPass,
  unit: ReviewUnit,
  key: string,
  vars: Record<string, string>,
): Promise<string> {
  return await renderPromptKey(
    store,
    key,
    vars,
    `unit "${unit.id}" in pass "${pass.id}"`,
  );
}

async function renderPromptKey(
  store: ConfigStore,
  key: string,
  vars: Record<string, string>,
  where: string,
): Promise<string> {
  const prompt = await store.getPrompt(key);
  if (!prompt) {
    throw new ConfigMissingError(`prompt "${key}" for ${where}`);
  }
  return renderTemplate(prompt.body, vars);
}

async function resolveUnitInstructions(
  store: ConfigStore,
  pass: ReviewPass,
  unit: ReviewUnit,
  vars: Record<string, string>,
): Promise<string> {
  if (!unit.instructionsPromptKey) return "";
  return await renderUnitPrompt(
    store,
    pass,
    unit,
    unit.instructionsPromptKey,
    vars,
  );
}

async function resolveUnitPool(
  store: ConfigStore,
  pass: ReviewPass,
  unit: ReviewUnit,
): Promise<ModelPool> {
  const poolId = unit.modelPoolId ?? pass.modelPoolId;
  const pool = await store.getModelPool(poolId);
  if (!pool) throw new ConfigMissingError(`model pool "${poolId}"`);
  if (pool.models.length === 0) {
    throw new ConfigMissingError(`model pool "${pool.id}" has no models`);
  }
  return pool;
}

/** Categories for attempt units; undefined for the rest. */
async function resolveUnitAttempt(
  store: ConfigStore,
  pass: ReviewPass,
  unit: ReviewUnit,
): Promise<{ categories: Category[]; repairRounds: number } | undefined> {
  const attempt = unit.attempt;
  if (!attempt) return undefined;
  if (attempt.allowedCategoryIds.length === 0) {
    throw new ConfigInvalidError(
      `attempt unit "${unit.id}" in pass "${pass.id}" has no allowed categories`,
    );
  }
  const categories = await resolveCategories(
    store,
    pass,
    unit,
    attempt.allowedCategoryIds,
  );
  return {
    categories,
    repairRounds: attempt.repairRounds ?? 1,
  };
}

async function resolveCategories(
  store: ConfigStore,
  pass: ReviewPass,
  unit: ReviewUnit,
  ids: string[],
): Promise<Category[]> {
  const [categories, missing] = await store.getCategories(ids);
  if (missing.length > 0) {
    throw new ConfigMissingError(
      `categories ${missing.map((id) => `"${id}"`).join(", ")} for unit "${unit.id}" in pass "${pass.id}"`,
    );
  }
  return categories;
}
