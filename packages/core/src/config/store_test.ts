import { assertEquals } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { ConfigStore } from "./store.ts";

function seed() {
  return new ConfigStore(new InMemoryAdapter());
}

Deno.test("ConfigStore -- CRUD round-trips", async () => {
  const store = seed();
  await store.saveModelPool({ id: "p", name: "P", models: ["m/a"] });
  assertEquals((await store.getModelPool("p"))?.name, "P");
  await store.deleteModelPool("p");
  assertEquals(await store.getModelPool("p"), undefined);

  await store.savePrompt({ key: "k", body: "b" });
  assertEquals((await store.getPrompt("k"))?.body, "b");
  await store.deletePrompt("k");
  assertEquals(await store.getPrompt("k"), undefined);

  await store.saveCategory({ id: "c", label: "C" });
  assertEquals((await store.getCategory("c"))?.label, "C");
  await store.deleteCategory("c");
  assertEquals(await store.getCategory("c"), undefined);

  const pass = {
    id: "r",
    name: "R",
    systemPromptKey: "sys",
    modelPoolId: "p",
    units: [{ id: "analyze", promptKey: "sys" }],
  };
  await store.saveReviewPass(pass);
  assertEquals((await store.getReviewPass("r"))?.name, "R");
  await store.deleteReviewPass("r");
  assertEquals(await store.getReviewPass("r"), undefined);
});

Deno.test("ConfigStore -- getCategories returns entries aligned with ids", async () => {
  const store = seed();
  await store.saveCategory({ id: "a", label: "A" });
  await store.saveCategory({ id: "b", label: "B" });

  const found = await store.getCategories(["a", "ghost", "b"]);

  assertEquals(found, [
    { id: "a", label: "A" },
    undefined,
    { id: "b", label: "B" },
  ]);
});

Deno.test("ConfigStore -- active pin set and clear", async () => {
  const store = seed();
  await store.saveReviewPass({
    id: "essay-review",
    name: "Essay review",
    systemPromptKey: "sys",
    modelPoolId: "pool",
    units: [{ id: "analyze", promptKey: "sys" }],
  });

  await store.setActiveReviewPass("essay-review");
  assertEquals(await store.getActiveReviewPassId(), "essay-review");

  await store.clearActiveReviewPass();
  assertEquals(await store.getActiveReviewPassId(), undefined);
});

Deno.test("ConfigStore -- list helpers", async () => {
  const store = seed();
  await store.saveModelPool({ id: "p", name: "P", models: ["m/a"] });
  await store.savePrompt({ key: "k", body: "b" });
  await store.saveCategory({ id: "c", label: "C" });
  await store.saveReviewPass({
    id: "r",
    name: "R",
    systemPromptKey: "k",
    modelPoolId: "p",
    units: [{ id: "analyze", promptKey: "k" }],
  });

  assertEquals((await store.listModelPools()).length, 1);
  assertEquals((await store.listPrompts()).length, 1);
  assertEquals((await store.listCategories()).length, 1);
  assertEquals((await store.listReviewPasses()).length, 1);
});
