/** Resolve a review pass into the prompts, model pools and categories its units run with. */

import { Effect, Option, Schema } from "effect";

import { renderCategories } from "#/reviews/steps/input.ts";

import { ReviewConfig } from "./service.ts";
import { renderTemplate } from "./template.ts";
import {
  type Category,
  ConfigMissingError,
  type ModelPool,
  type ResolvedReviewPass,
  type ResolvedReviewUnit,
  type ReviewPass,
  type ReviewUnit,
} from "./types.ts";

/** Resolution fails on a structurally invalid pass. */
export class ConfigInvalidError extends Schema.TaggedError<ConfigInvalidError>()(
  "ConfigInvalidError",
  { what: Schema.String },
) {
  override get message() {
    return `Config invalid: ${this.what}`;
  }
}

type ResolveError = ConfigMissingError | ConfigInvalidError;

export const resolveReviewPassById = (
  id: string,
): Effect.Effect<ResolvedReviewPass, ResolveError, ReviewConfig> =>
  Effect.flatMap(
    ReviewConfig.use((config) => config.getReviewPass(id)),
    resolveReviewPass,
  );

/** Resolve the active review pass; none when no pass is active. */
export const resolveActiveReviewPass: Effect.Effect<
  Option.Option<ResolvedReviewPass>,
  ResolveError,
  ReviewConfig
> = Effect.gen(function* () {
  const activeId = yield* ReviewConfig.use((config) => config.getActiveReviewPassId());
  if (Option.isNone(activeId)) return Option.none();
  return Option.some(yield* resolveReviewPassById(activeId.value));
});

/**
 * Resolve a pass's units in order: render the shared system prompt and each unit's prompts with
 * the pass variables, resolve each unit's model pool (unit override or pass default), and resolve
 * categories for attempt units. Units resolve concurrently.
 */
export const resolveReviewPass = (
  pass: ReviewPass,
): Effect.Effect<ResolvedReviewPass, ResolveError, ReviewConfig> =>
  Effect.gen(function* () {
    yield* assertUnitOrder(pass);
    const vars = Option.getOrElse(pass.variables, () => ({}));
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
      // A unit could both place marks and summarize them; exclusive until a pass needs it.
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
    const prompt = yield* ReviewConfig.use((config) => config.getPrompt(key)).pipe(
      Effect.mapError((error) => new ConfigMissingError({ what: `${error.what} for ${where}` })),
    );
    return renderTemplate(prompt.body, vars);
  });

const resolveUnitPool = (
  passPoolId: string,
  unit: ReviewUnit,
): Effect.Effect<ModelPool, ResolveError, ReviewConfig> =>
  Effect.gen(function* () {
    const pool = yield* ReviewConfig.use((config) =>
      config.getModelPool(unit.modelPoolId ?? passPoolId),
    );
    if (pool.models.length === 0) {
      return yield* Effect.fail(
        new ConfigInvalidError({ what: `model pool "${pool.id}" has no models` }),
      );
    }
    return pool;
  });

/** Categories for attempt units; `undefined` for the rest. */
const resolveUnitAttempt = (
  passId: string,
  unit: ReviewUnit,
): Effect.Effect<
  { categories: ReadonlyArray<Category>; repairRounds: number } | undefined,
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
    const categories = yield* ReviewConfig.use((config) =>
      config.getCategories(attempt.allowedCategoryIds),
    ).pipe(
      Effect.mapError(
        (error) =>
          new ConfigMissingError({
            what: `${error.what} for unit "${unit.id}" in pass "${passId}"`,
          }),
      ),
    );
    return { categories, repairRounds: attempt.repairRounds ?? 1 };
  });
