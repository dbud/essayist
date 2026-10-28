/**
 * Resolve the active review pass (and any given pass) into a
 * ResolvedReviewPass bundle. Requires the ReviewConfig service.
 */

import { Effect, Schema } from "effect";

import type { PersistenceError } from "#/persistence/mod.ts";
import { renderCategories } from "#/reviews/steps/input.ts";

import { ReviewConfig } from "./service.ts";
import { renderTemplate } from "./template.ts";
import type {
  Category,
  ModelPool,
  ResolvedReviewPass,
  ResolvedReviewUnit,
  ReviewPass,
  ReviewUnit,
} from "./types.ts";

/** Resolution fails on config entities the pass references but that are missing. */
export class ConfigMissingError extends Schema.TaggedError<ConfigMissingError>()(
  "ConfigMissingError",
  { what: Schema.String },
) {
  override get message() {
    return `Config missing: ${this.what}`;
  }
}

/** Resolution fails on a structurally invalid pass. */
export class ConfigInvalidError extends Schema.TaggedError<ConfigInvalidError>()(
  "ConfigInvalidError",
  { what: Schema.String },
) {
  override get message() {
    return `Config invalid: ${this.what}`;
  }
}

type ResolveError = ConfigMissingError | ConfigInvalidError | PersistenceError;

/**
 * Resolve the active review pass into a ResolvedReviewPass bundle.
 * Runs as an effect: `undefined` if none is pinned.
 */
export const resolveActiveReviewPass: Effect.Effect<
  ResolvedReviewPass | undefined,
  ResolveError,
  ReviewConfig
> = Effect.gen(function* () {
  const config = yield* ReviewConfig;
  const activeId = yield* config.getActiveReviewPassId();
  if (!activeId) return undefined;

  const pass = yield* config.getReviewPass(activeId);
  if (!pass) {
    return yield* Effect.fail(new ConfigMissingError({ what: `review pass "${activeId}"` }));
  }
  return yield* resolveReviewPass(pass);
});

/**
 * Resolve a pass's units in order: render the shared system prompt and
 * each unit's prompts with the pass variables, resolve each unit's model
 * pool (unit override or pass default), and resolve categories for attempt
 * units. Units resolve concurrently.
 */
export const resolveReviewPass = (
  pass: ReviewPass,
): Effect.Effect<ResolvedReviewPass, ResolveError, ReviewConfig> =>
  Effect.gen(function* () {
    yield* assertUnitOrder(pass);
    const vars = pass.variables ?? {};
    const system = yield* renderPrompt(`pass "${pass.id}"`, pass.systemPromptKey, vars);
    const units = yield* Effect.all(
      pass.units.map((unit) => resolveUnit(pass.id, pass.modelPoolId, unit, system, vars)),
    );
    return { pass, units };
  });

const assertUnitOrder = (pass: ReviewPass): Effect.Effect<void, ConfigInvalidError> =>
  Effect.gen(function* () {
    const seen = new Set<string>();
    for (const unit of pass.units) {
      if (unit.id.includes(".")) {
        return yield* Effect.fail(
          new ConfigInvalidError({
            what: `unit id "${unit.id}" in pass "${pass.id}" must not contain ".", which is reserved for derived node ids`,
          }),
        );
      }
      if (seen.has(unit.id)) {
        return yield* Effect.fail(
          new ConfigInvalidError({
            what: `unit id "${unit.id}" is used more than once in pass "${pass.id}"`,
          }),
        );
      }
      for (const ref of unit.inputs ?? []) {
        if (!seen.has(ref)) {
          return yield* Effect.fail(
            new ConfigInvalidError({
              what: `unit "${unit.id}" in pass "${pass.id}" references unknown or later unit "${ref}"`,
            }),
          );
        }
      }
      seen.add(unit.id);
    }
  });

const resolveUnit = (
  passId: string,
  passPoolId: string,
  unit: ReviewUnit,
  system: string,
  vars: Readonly<Record<string, string>>,
): Effect.Effect<ResolvedReviewUnit, ResolveError, ReviewConfig> =>
  Effect.gen(function* () {
    if (unit.attempt && unit.summary) {
      // A unit could both place marks and summarize them; exclusive until a
      // pass needs it.
      return yield* Effect.fail(
        new ConfigInvalidError({
          what: `unit "${unit.id}" in pass "${passId}" sets both attempt and summary`,
        }),
      );
    }
    const [directive, instructions, pool, attempt] = yield* Effect.all([
      renderPrompt(`unit "${unit.id}" in pass "${passId}"`, unit.promptKey, vars),
      resolveUnitInstructions(passId, unit, vars),
      resolveUnitPool(passPoolId, unit),
      resolveUnitAttempt(passId, unit),
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
  });

const resolveUnitInstructions = (
  passId: string,
  unit: ReviewUnit,
  vars: Readonly<Record<string, string>>,
): Effect.Effect<string, ResolveError, ReviewConfig> =>
  unit.instructionsPromptKey === undefined
    ? Effect.succeed("")
    : renderPrompt(`unit "${unit.id}" in pass "${passId}"`, unit.instructionsPromptKey, vars);

const renderPrompt = (
  where: string,
  key: string,
  vars: Readonly<Record<string, string>>,
): Effect.Effect<string, ResolveError, ReviewConfig> =>
  Effect.gen(function* () {
    const config = yield* ReviewConfig;
    const prompt = yield* config.getPrompt(key);
    if (!prompt) {
      return yield* Effect.fail(new ConfigMissingError({ what: `prompt "${key}" for ${where}` }));
    }
    return renderTemplate(prompt.body, vars);
  });

const resolveUnitPool = (
  passPoolId: string,
  unit: ReviewUnit,
): Effect.Effect<ModelPool, ResolveError, ReviewConfig> =>
  Effect.gen(function* () {
    const config = yield* ReviewConfig;
    const poolId = unit.modelPoolId ?? passPoolId;
    const pool = yield* config.getModelPool(poolId);
    if (!pool) {
      return yield* Effect.fail(new ConfigMissingError({ what: `model pool "${poolId}"` }));
    }
    if (pool.models.length === 0) {
      return yield* Effect.fail(
        new ConfigMissingError({
          what: `model pool "${pool.id}" has no models`,
        }),
      );
    }
    return pool;
  });

/** Categories for attempt units; `undefined` for the rest. */
const resolveUnitAttempt = (
  passId: string,
  unit: ReviewUnit,
): Effect.Effect<
  { categories: Category[]; repairRounds: number } | undefined,
  ResolveError,
  ReviewConfig
> =>
  Effect.gen(function* () {
    const attempt = unit.attempt;
    if (!attempt) return undefined;
    if (attempt.allowedCategoryIds.length === 0) {
      return yield* Effect.fail(
        new ConfigInvalidError({
          what: `attempt unit "${unit.id}" in pass "${passId}" has no allowed categories`,
        }),
      );
    }
    const config = yield* ReviewConfig;
    const [categories, missing] = yield* config.getCategories(attempt.allowedCategoryIds);
    if (missing.length > 0) {
      return yield* Effect.fail(
        new ConfigMissingError({
          what: `categories ${missing.map((id) => `"${id}"`).join(", ")} for unit "${unit.id}" in pass "${passId}"`,
        }),
      );
    }
    return { categories, repairRounds: attempt.repairRounds ?? 1 };
  });
