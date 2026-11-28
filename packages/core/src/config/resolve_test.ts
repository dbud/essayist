import { assert, assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Option, Result } from "effect";
import { test } from "vitest";

import { layerReviewConfigD1 } from "#/config/config_d1.ts";
import { category, reviewPass } from "#/config/testing.ts";
import { testLayerD1 } from "#/d1/testing.ts";

import { ConfigInvalidError, resolveActiveReviewPass } from "./resolve.ts";
import { ReviewConfig } from "./service.ts";
import { ConfigMissingError, ModelPool, Prompt, type ResolvedReviewPass } from "./types.ts";

/** Run a resolution against a seeded or empty ephemeral store; returns the
 * program's exit for failure assertions. */
function run(
  seed: (config: ReviewConfig["Service"]) => Effect.Effect<unknown> = () => Effect.void,
) {
  return Effect.gen(function* () {
    const config = yield* ReviewConfig;
    yield* seed(config);
    return yield* Effect.result(resolveActiveReviewPass);
  });
}

function assertFailsWith(
  outcome: Result.Result<Option.Option<ResolvedReviewPass>, unknown>,
  errorClass: abstract new (...args: never) => { message: string },
  substring?: string,
): void {
  if (Result.isSuccess(outcome)) {
    throw new Error(`expected a ${errorClass.name}, got a success`);
  }
  assertInstanceOf(outcome.failure, errorClass);
  if (substring !== undefined) {
    assert(
      outcome.failure.message.includes(substring),
      `message did not include ${substring}: ${outcome.failure.message}`,
    );
  }
}

const FREE_MODELS = ["poolside/laguna-s-2.1:free", "nvidia/nemotron-3.5-lightning:free"];

function seedFullConfig(config: ReviewConfig["Service"]) {
  return Effect.gen(function* () {
    yield* config.saveModelPool(
      new ModelPool({
        id: "free-pool",
        name: "Free pool",
        models: FREE_MODELS,
      }),
    );
    yield* config.saveModelPool(
      new ModelPool({
        id: "strong-pool",
        name: "Strong pool",
        models: ["openai/gpt-5.2"],
      }),
    );
    yield* config.savePrompt(
      new Prompt({
        key: "system.reviewer",
        body: "You are {{role}}.",
      }),
    );
    yield* config.savePrompt(
      new Prompt({
        key: "directive.analyze",
        body: "Describe the piece as {{role}} would read it.",
      }),
    );
    yield* config.savePrompt(
      new Prompt({
        key: "directive.mechanics",
        body: "Scan for grammar faults.",
      }),
    );
    yield* config.savePrompt(
      new Prompt({
        key: "directive.argument",
        body: "Find where a skeptical reader resists.",
      }),
    );
    yield* config.savePrompt(
      new Prompt({
        key: "directive.synthesize",
        body: "Summarize the marks for the writer.",
      }),
    );
    yield* config.savePrompt(
      new Prompt({
        key: "instructions.marks",
        body: "Quote exact spans with {{file}} context.",
      }),
    );
    yield* config.saveCategory(
      category({
        id: "thesis",
        label: "thesis",
        description: "Thesis clarity",
      }),
    );
    yield* config.saveCategory(
      category({
        id: "evidence",
        label: "evidence",
        description: "Evidence quality",
      }),
    );
    yield* config.saveCategory(
      category({
        id: "grammar",
        label: "grammar",
        description: "Grammar and mechanics",
      }),
    );
    yield* config.saveReviewPass(
      reviewPass({
        id: "essay-review",
        name: "Essay review",
        systemPromptKey: "system.reviewer",
        modelPoolId: "free-pool",
        variables: { role: "an editor" },
        units: [
          {
            id: "analyze",
            promptKey: "directive.analyze",
          },
          {
            id: "mechanics",
            promptKey: "directive.mechanics",
            instructionsPromptKey: "instructions.marks",
            attempt: { allowedCategoryIds: ["grammar"] },
          },
          {
            id: "argument",
            promptKey: "directive.argument",
            modelPoolId: "strong-pool",
            attempt: { allowedCategoryIds: ["thesis", "evidence"] },
            inputs: ["analyze"],
          },
          {
            id: "synthesize",
            promptKey: "directive.synthesize",
            summary: true,
          },
        ],
      }),
    );
    yield* config.setActiveReviewPass("essay-review");
  });
}

// happy paths

test("resolveActiveReviewPass -- resolves the active pass unit by unit", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run(seedFullConfig);
    if (Result.isFailure(outcome)) {
      throw new Error(`resolution failed: ${outcome.failure.message}`);
    }
    const resolved = Option.getOrThrow(outcome.success);
    assertEquals(resolved.pass.id, "essay-review");
    assertEquals(resolved.units.length, 4);

    const [analyze, mechanics, argument, synthesize] = resolved.units;
    assertEquals(analyze.id, "analyze");
    assertEquals(analyze.pool.models, FREE_MODELS);
    assertEquals(analyze.prompts.system, "You are an editor.");
    assertEquals(analyze.prompts.directive, "Describe the piece as an editor would read it.");
    assertEquals(analyze.prompts.instructions, "");
    assertEquals(analyze.attempt, undefined);
    assertEquals(analyze.summary, undefined);

    assertEquals(mechanics.attempt, {
      categories: [
        category({
          id: "grammar",
          label: "grammar",
          description: "Grammar and mechanics",
        }),
      ],
      repairRounds: 1,
    });
    assertEquals(mechanics.prompts.instructions, "Quote exact spans with {{file}} context.");

    assertEquals(argument.pool.models, ["openai/gpt-5.2"]);
    assertEquals(argument.attempt, {
      categories: [
        category({ id: "thesis", label: "thesis", description: "Thesis clarity" }),
        category({
          id: "evidence",
          label: "evidence",
          description: "Evidence quality",
        }),
      ],
      repairRounds: 1,
    });
    assertEquals(argument.inputs, ["analyze"]);

    assertEquals(synthesize.summary, true);
    assertEquals(synthesize.attempt, undefined);
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- none when no pass is active", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run();
    if (Result.isFailure(outcome)) {
      throw new Error(`resolution failed: ${outcome.failure.message}`);
    }
    assertEquals(outcome.success, Option.none());
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

// missing entities

test("resolveActiveReviewPass -- fails on a missing unit pool", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveCategory(category({ id: "c", label: "c", description: "d" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "missing-pool",
            units: [
              {
                id: "mark",
                promptKey: "sys",
                attempt: { allowedCategoryIds: ["c"] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigMissingError, 'model pool "missing-pool"');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on an empty unit pool", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(new ModelPool({ id: "empty", name: "Empty", models: [] }));
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveCategory(category({ id: "c", label: "c", description: "d" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "empty",
            units: [
              {
                id: "mark",
                promptKey: "sys",
                attempt: { allowedCategoryIds: ["c"] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigInvalidError, 'model pool "empty" has no models');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on a missing unit prompt", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveCategory(category({ id: "c", label: "c", description: "d" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [
              {
                id: "mark",
                promptKey: "missing.prompt",
                attempt: { allowedCategoryIds: ["c"] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigMissingError, 'prompt "missing.prompt" for unit "mark"');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on a missing pass system prompt", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.saveCategory(category({ id: "c", label: "c", description: "d" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "missing.system",
            modelPoolId: "pool",
            units: [
              {
                id: "mark",
                promptKey: "sys",
                attempt: { allowedCategoryIds: ["c"] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigMissingError, 'prompt "missing.system" for pass "r"');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on missing referenced categories", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [
              {
                id: "mark",
                promptKey: "sys",
                attempt: {
                  allowedCategoryIds: ["gone", "also-gone"],
                },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigMissingError, '"gone", "also-gone"');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

// invalid passes

test("resolveActiveReviewPass -- fails on attempt units without categories", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [
              {
                id: "mark",
                promptKey: "sys",
                attempt: { allowedCategoryIds: [] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(
      outcome,
      ConfigInvalidError,
      'attempt unit "mark" in pass "r" has no allowed categories',
    );
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on duplicate unit ids", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveCategory(category({ id: "c", label: "c", description: "d" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [
              {
                id: "mark",
                promptKey: "sys",
                attempt: { allowedCategoryIds: ["c"] },
              },
              {
                id: "mark",
                promptKey: "sys",
                attempt: { allowedCategoryIds: ["c"] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigInvalidError, 'unit id "mark" is used more than once');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on dotted unit ids", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [{ id: "mechanics.propose", promptKey: "sys" }],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigInvalidError, 'must not contain "."');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on forward unit inputs", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [
              { id: "first", promptKey: "sys", inputs: ["second"] },
              { id: "second", promptKey: "sys" },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigInvalidError, 'references unknown or later unit "second"');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on unknown unit inputs", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [{ id: "early", promptKey: "sys", inputs: ["ghost"] }],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(outcome, ConfigInvalidError, 'references unknown or later unit "ghost"');
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});

test("resolveActiveReviewPass -- fails on attempt and summary together", async () => {
  const program = Effect.gen(function* () {
    const outcome = yield* run((config) =>
      Effect.gen(function* () {
        yield* config.saveModelPool(
          new ModelPool({
            id: "pool",
            name: "Pool",
            models: ["m/ref"],
          }),
        );
        yield* config.savePrompt(new Prompt({ key: "sys", body: "hi" }));
        yield* config.saveCategory(category({ id: "c", label: "c", description: "d" }));
        yield* config.saveReviewPass(
          reviewPass({
            id: "r",
            name: "R",
            systemPromptKey: "sys",
            modelPoolId: "pool",
            units: [
              {
                id: "both",
                promptKey: "sys",
                summary: true,
                attempt: { allowedCategoryIds: ["c"] },
              },
            ],
          }),
        );
        yield* config.setActiveReviewPass("r");
      }),
    );
    assertFailsWith(
      outcome,
      ConfigInvalidError,
      'unit "both" in pass "r" sets both attempt and summary',
    );
  });
  await Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));
});
