import { assertEquals, assertRejects } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import {
  ConfigInvalidError,
  ConfigMissingError,
  resolveActiveReviewPass,
} from "./resolve.ts";
import { ConfigStore } from "./store.ts";

function seed() {
  return new ConfigStore(new InMemoryAdapter());
}

const FREE_MODELS = [
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3.5-lightning:free",
];

async function seedFullConfig(store: ConfigStore) {
  await store.saveModelPool({
    id: "free-pool",
    name: "Free pool",
    models: FREE_MODELS,
  });
  await store.saveModelPool({
    id: "strong-pool",
    name: "Strong pool",
    models: ["openai/gpt-5.2"],
  });
  await store.savePrompt({ key: "system.reviewer", body: "You are {{role}}." });
  await store.savePrompt({
    key: "directive.analyze",
    body: "Describe the piece as {{role}} would read it.",
  });
  await store.savePrompt({
    key: "directive.mechanics",
    body: "Scan for grammar faults.",
  });
  await store.savePrompt({
    key: "directive.argument",
    body: "Find where a skeptical reader resists.",
  });
  await store.savePrompt({
    key: "directive.synthesize",
    body: "Summarize the marks for the writer.",
  });
  await store.savePrompt({
    key: "instructions.marks",
    body: "Quote exact spans with {{file}} context.",
  });
  await store.saveCategory({
    id: "thesis",
    label: "thesis",
    description: "Thesis clarity",
  });
  await store.saveCategory({
    id: "evidence",
    label: "evidence",
    description: "Evidence quality",
  });
  await store.saveCategory({
    id: "grammar",
    label: "grammar",
    description: "Grammar and mechanics",
  });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("essay-review");
}

Deno.test("resolveActiveReviewPass -- resolves the active pass unit by unit", async () => {
  const store = seed();
  await seedFullConfig(store);

  const resolved = await resolveActiveReviewPass(store);
  if (!resolved) throw new Error("expected resolved review pass");
  assertEquals(resolved.pass.id, "essay-review");
  assertEquals(resolved.units.length, 4);

  const [analyze, mechanics, argument, synthesize] = resolved.units;
  assertEquals(analyze.id, "analyze");
  assertEquals(analyze.pool.models, FREE_MODELS);
  assertEquals(analyze.prompts.system, "You are an editor.");
  assertEquals(
    analyze.prompts.directive,
    "Describe the piece as an editor would read it.",
  );
  assertEquals(analyze.prompts.instructions, "");
  assertEquals(analyze.attempt, undefined);
  assertEquals(analyze.summary, undefined);

  assertEquals(mechanics.attempt, {
    labels: ["grammar"],
    repairRounds: 1,
  });
  assertEquals(
    mechanics.prompts.instructions,
    "Quote exact spans with {{file}} context.",
  );

  assertEquals(argument.pool.models, ["openai/gpt-5.2"]);
  assertEquals(argument.attempt, {
    labels: ["thesis", "evidence"],
    repairRounds: 1,
  });
  assertEquals(argument.inputs, ["analyze"]);

  assertEquals(synthesize.summary, true);
  assertEquals(synthesize.attempt, undefined);
});

Deno.test("resolveActiveReviewPass -- undefined when no pin", async () => {
  const store = seed();
  assertEquals(await resolveActiveReviewPass(store), undefined);
});

Deno.test("resolveActiveReviewPass -- respects pool.apiKeyEnvKey when set", async () => {
  const store = seed();
  await store.saveModelPool({
    id: "p",
    name: "P",
    models: ["m/a"],
    apiKeyEnvKey: "CUSTOM_KEY",
  });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    systemPromptKey: "sys",
    modelPoolId: "p",
    units: [
      {
        id: "mark",
        promptKey: "sys",
        attempt: { allowedCategoryIds: ["c"] },
      },
    ],
  });
  await store.setActiveReviewPass("r");
  const resolved = await resolveActiveReviewPass(store);
  assertEquals(resolved?.units[0].pool.apiKeyEnvKey, "CUSTOM_KEY");
});

Deno.test("resolveActiveReviewPass -- throws on missing review pass", async () => {
  const store = seed();
  await store.setActiveReviewPass("nope");
  await assertRejects(() => resolveActiveReviewPass(store), ConfigMissingError);
});

Deno.test("resolveActiveReviewPass -- throws on missing unit pool", async () => {
  const store = seed();
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigMissingError,
    'model pool "missing-pool"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on empty unit pool", async () => {
  const store = seed();
  await store.saveModelPool({ id: "empty", name: "Empty", models: [] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigMissingError,
    'model pool "empty" has no models',
  );
});

Deno.test("resolveActiveReviewPass -- throws on missing unit prompt", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigMissingError,
    'prompt "missing.prompt" for unit "mark"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on missing pass system prompt", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigMissingError,
    'prompt "missing.system" for pass "r"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on attempt unit without categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'attempt unit "mark" in pass "r" has no allowed categories',
  );
});

Deno.test("resolveActiveReviewPass -- throws on missing referenced categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    systemPromptKey: "sys",
    modelPoolId: "pool",
    units: [
      {
        id: "mark",
        promptKey: "sys",
        attempt: { allowedCategoryIds: ["gone", "also-gone"] },
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigMissingError,
    '"gone", "also-gone"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on duplicate unit ids", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'unit id "mark" is used more than once',
  );
});

Deno.test("resolveActiveReviewPass -- throws on dotted unit ids", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    systemPromptKey: "sys",
    modelPoolId: "pool",
    units: [{ id: "mechanics.propose", promptKey: "sys" }],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'must not contain "."',
  );
});

Deno.test("resolveActiveReviewPass -- throws on forward unit inputs", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    systemPromptKey: "sys",
    modelPoolId: "pool",
    units: [
      { id: "first", promptKey: "sys", inputs: ["second"] },
      { id: "second", promptKey: "sys" },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'references unknown or later unit "second"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on unknown unit inputs", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    systemPromptKey: "sys",
    modelPoolId: "pool",
    units: [{ id: "early", promptKey: "sys", inputs: ["ghost"] }],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'references unknown or later unit "ghost"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on attempt and summary together", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
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
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'unit "both" in pass "r" sets both attempt and summary',
  );
});
