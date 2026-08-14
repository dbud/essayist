import { assertEquals, assertRejects } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { ConfigMissingError, ConfigStore } from "./store.ts";

function seed() {
  return new ConfigStore(new InMemoryAdapter());
}

async function seedFullConfig(store: ConfigStore) {
  await store.saveModelPool({
    id: "free-pool",
    name: "Free pool",
    models: [
      "poolside/laguna-s-2.1:free",
      "nvidia/nemotron-3.5-lightning:free",
    ],
  });
  await store.savePrompt({
    key: "system.reviewer",
    body: "You are {{role}}.",
    variables: ["role"],
  });
  await store.savePrompt({
    key: "instructions.mark",
    body: "Use the mark tool with {{categories}} labels.",
  });
  await store.savePrompt({
    key: "directive.review",
    body: 'Review the file "{{file}}". Read it, then mark issues using the allowed labels.',
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
  await store.saveReviewPass({
    id: "essay-review",
    name: "Essay review",
    modelPoolId: "free-pool",
    systemPromptKey: "system.reviewer",
    directivePromptKey: "directive.review",
    instructionsPromptKey: "instructions.mark",
    enabledTools: ["read_file", "list_files", "grep", "mark"],
    allowedCategoryIds: ["thesis", "evidence"],
    maxRounds: 5,
    variables: { role: "an editor", categories: "thesis or evidence" },
  });
  await store.setActiveReviewPass("essay-review");
}

Deno.test("ConfigStore -- CRUD round-trips", async () => {
  const store = seed();
  await store.saveModelPool({ id: "p", name: "P", models: ["m/a"] });
  assertEquals((await store.getModelPool("p"))?.name, "P");
  await store.deleteModelPool("p");
  assertEquals(await store.getModelPool("p"), undefined);
});

Deno.test("ConfigStore -- active pin + resolveActiveReviewPass", async () => {
  const store = seed();
  await seedFullConfig(store);

  const resolved = await store.resolveActiveReviewPass();
  if (!resolved) throw new Error("expected resolved review pass");
  assertEquals(resolved.reviewPass.id, "essay-review");
  assertEquals(resolved.modelRefs, [
    "poolside/laguna-s-2.1:free",
    "nvidia/nemotron-3.5-lightning:free",
  ]);
  assertEquals(resolved.apiKeyEnvKey, "OPENROUTER_API_KEY");
  assertEquals(resolved.systemPrompt, "You are an editor.");
  assertEquals(
    resolved.instructions,
    "Use the mark tool with thesis or evidence labels.",
  );
  assertEquals(
    resolved.directive,
    'Review the file "{{file}}". Read it, then mark issues using the allowed labels.',
  );
  assertEquals(resolved.allowedLabels, ["thesis", "evidence"]);
});

Deno.test("ConfigStore -- resolveActiveReviewPass undefined when no pin", async () => {
  const store = seed();
  assertEquals(await store.resolveActiveReviewPass(), undefined);
});

Deno.test("ConfigStore -- respects pool.apiKeyEnvKey when set", async () => {
  const store = seed();
  await store.saveModelPool({
    id: "p",
    name: "P",
    models: ["m/a"],
    apiKeyEnvKey: "CUSTOM_KEY",
  });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveCategory({
    id: "c",
    label: "c",
    description: "d",
  });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "p",
    systemPromptKey: "sys",
    directivePromptKey: "sys",
    enabledTools: ["read_file"],
    allowedCategoryIds: ["c"],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  assertEquals(
    (await store.resolveActiveReviewPass())?.apiKeyEnvKey,
    "CUSTOM_KEY",
  );
});

Deno.test("ConfigStore -- resolve throws on missing review pass", async () => {
  const store = seed();
  await store.setActiveReviewPass("nope");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
  );
});

Deno.test("ConfigStore -- resolve throws on missing model pool", async () => {
  const store = seed();
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "missing-pool",
    systemPromptKey: "p",
    directivePromptKey: "p",
    enabledTools: ["read_file"],
    allowedCategoryIds: [],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
  );
});

Deno.test("ConfigStore -- resolve throws on empty model pool", async () => {
  const store = seed();
  await store.saveModelPool({ id: "empty", name: "Empty", models: [] });
  await store.savePrompt({ key: "p", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "empty",
    systemPromptKey: "p",
    directivePromptKey: "p",
    enabledTools: ["read_file"],
    allowedCategoryIds: [],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
  );
});

Deno.test("ConfigStore -- resolve throws on missing prompt", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    systemPromptKey: "missing.prompt",
    directivePromptKey: "p",
    enabledTools: ["read_file"],
    allowedCategoryIds: [],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
  );
});

Deno.test("ConfigStore -- resolve throws on missing directive prompt", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    systemPromptKey: "sys",
    directivePromptKey: "missing.directive",
    enabledTools: ["read_file"],
    allowedCategoryIds: [],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
  );
});

Deno.test("ConfigStore -- resolve throws on no allowed categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    systemPromptKey: "sys",
    directivePromptKey: "sys",
    enabledTools: ["read_file"],
    allowedCategoryIds: [],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
    'review pass "r" has no allowed categories',
  );
});

Deno.test("ConfigStore -- resolve throws on missing referenced categories", async () => {
  const store = seed();
  await store.saveModelPool({ id: "pool", name: "Pool", models: ["m/ref"] });
  await store.savePrompt({ key: "sys", body: "hi" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    modelPoolId: "pool",
    systemPromptKey: "sys",
    directivePromptKey: "sys",
    enabledTools: ["read_file"],
    allowedCategoryIds: ["gone", "also-gone"],
    maxRounds: 3,
  });
  await store.setActiveReviewPass("r");
  await assertRejects(
    () => store.resolveActiveReviewPass(),
    ConfigMissingError,
    "references missing categories: gone, also-gone",
  );
});

Deno.test("ConfigStore -- clearActiveReviewPass removes the pin", async () => {
  const store = seed();
  await seedFullConfig(store);
  assertEquals(await store.getActiveReviewPassId(), "essay-review");
  await store.clearActiveReviewPass();
  assertEquals(await store.getActiveReviewPassId(), undefined);
});

Deno.test("ConfigStore -- list helpers", async () => {
  const store = seed();
  await seedFullConfig(store);
  assertEquals((await store.listModelPools()).length, 1);
  assertEquals((await store.listPrompts()).length, 3);
  assertEquals((await store.listCategories()).length, 2);
  assertEquals((await store.listReviewPasses()).length, 1);
});
