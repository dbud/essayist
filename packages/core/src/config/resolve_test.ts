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
    modelPoolId: "free-pool",
    variables: { role: "an editor" },
    steps: [
      {
        id: "analyze",
        name: "Analyze",
        kind: "analyze",
        systemPromptKey: "system.reviewer",
        directivePromptKey: "directive.analyze",
      },
      {
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        systemPromptKey: "system.reviewer",
        directivePromptKey: "directive.mechanics",
        instructionsPromptKey: "instructions.marks",
        allowedCategoryIds: ["grammar"],
      },
      {
        id: "argument",
        name: "Argument",
        kind: "mark",
        modelPoolId: "strong-pool",
        systemPromptKey: "system.reviewer",
        directivePromptKey: "directive.argument",
        allowedCategoryIds: ["thesis", "evidence"],
        artifactsFromStepIds: ["analyze"],
      },
      {
        id: "synthesize",
        name: "Synthesize",
        kind: "synthesize",
        systemPromptKey: "system.reviewer",
        directivePromptKey: "directive.synthesize",
      },
    ],
  });
  await store.setActiveReviewPass("essay-review");
}

Deno.test("resolveActiveReviewPass -- resolves the active pass step by step", async () => {
  const store = seed();
  await seedFullConfig(store);

  const resolved = await resolveActiveReviewPass(store);
  if (!resolved) throw new Error("expected resolved review pass");
  assertEquals(resolved.pass.id, "essay-review");
  assertEquals(resolved.steps.length, 4);

  const [analyze, mechanics, argument, synthesize] = resolved.steps;
  assertEquals(analyze.step.id, "analyze");
  assertEquals(analyze.modelRefs, FREE_MODELS);
  assertEquals(analyze.apiKeyEnvKey, "OPENROUTER_API_KEY");
  assertEquals(analyze.systemPrompt, "You are an editor.");
  assertEquals(
    analyze.directive,
    "Describe the piece as an editor would read it.",
  );
  assertEquals(analyze.instructions, "");
  assertEquals(analyze.categories, []);

  assertEquals(mechanics.allowedLabels, ["grammar"]);
  assertEquals(
    mechanics.instructions,
    "Quote exact spans with {{file}} context.",
  );

  assertEquals(argument.modelRefs, ["openai/gpt-5.2"]);
  assertEquals(argument.allowedLabels, ["thesis", "evidence"]);
  assertEquals(
    argument.categories.map((c) => c.id),
    ["thesis", "evidence"],
  );

  assertEquals(synthesize.categories, []);
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
    modelPoolId: "p",
    steps: [
      {
        id: "mark",
        name: "Mark",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["c"],
      },
    ],
  });
  await store.setActiveReviewPass("r");
  const resolved = await resolveActiveReviewPass(store);
  assertEquals(resolved?.steps[0].apiKeyEnvKey, "CUSTOM_KEY");
});

Deno.test("resolveActiveReviewPass -- throws on missing review pass", async () => {
  const store = seed();
  await store.setActiveReviewPass("nope");
  await assertRejects(() => resolveActiveReviewPass(store), ConfigMissingError);
});

Deno.test("resolveActiveReviewPass -- throws on missing step pool", async () => {
  const store = seed();
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "missing-pool",
    steps: [
      {
        id: "mark",
        name: "Mark",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["c"],
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

Deno.test("resolveActiveReviewPass -- throws on empty step pool", async () => {
  const store = seed();
  await store.saveModelPool({ id: "empty", name: "Empty", models: [] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "empty",
    steps: [
      {
        id: "mark",
        name: "Mark",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["c"],
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

Deno.test("resolveActiveReviewPass -- throws on missing step prompt", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "mark",
        name: "Mark",
        kind: "mark",
        systemPromptKey: "missing.prompt",
        directivePromptKey: "missing.prompt",
        allowedCategoryIds: ["c"],
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigMissingError,
    'prompt "missing.prompt" for step "mark"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on mark step without categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "mark",
        name: "Mark",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'mark step "mark" in pass "r" has no allowed categories',
  );
});

Deno.test("resolveActiveReviewPass -- throws on missing referenced categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "mark",
        name: "Mark",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["gone", "also-gone"],
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

Deno.test("resolveActiveReviewPass -- throws on duplicate step ids", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({ id: "c", label: "c", description: "d" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "mark",
        name: "Mark one",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["c"],
      },
      {
        id: "mark",
        name: "Mark two",
        kind: "mark",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["c"],
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'step id "mark" is used more than once',
  );
});

Deno.test("resolveActiveReviewPass -- throws on forward artifactsFromStepIds", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "first",
        name: "First",
        kind: "analyze",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        artifactsFromStepIds: ["second"],
      },
      {
        id: "second",
        name: "Second",
        kind: "analyze",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'references unknown or later step "second"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on unknown artifactsFromStepIds", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "early",
        name: "Early",
        kind: "analyze",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        artifactsFromStepIds: ["ghost"],
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    'references unknown or later step "ghost"',
  );
});

Deno.test("resolveActiveReviewPass -- throws on non-mark step with categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    steps: [
      {
        id: "analyze",
        name: "Analyze",
        kind: "analyze",
        systemPromptKey: "sys",
        directivePromptKey: "sys",
        allowedCategoryIds: ["c"],
      },
    ],
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => resolveActiveReviewPass(store),
    ConfigInvalidError,
    "is analyze but sets allowedCategoryIds",
  );
});
