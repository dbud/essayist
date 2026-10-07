import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import { Persistence, type PersistenceError } from "@/persistence/mod.ts";
import { ReviewConfig } from "./service.ts";

function makeLayer(): Layer.Layer<ReviewConfig, PersistenceError> {
  return Layer.provide(
    ReviewConfig.layerNoDeps,
    Persistence.layerKv(":memory:"),
  );
}

Deno.test("ReviewConfig -- CRUD round-trips", async () => {
  const program = Effect.gen(function* () {
    const store = yield* ReviewConfig;
    yield* store.saveModelPool({ id: "p", name: "P", models: ["m/a"] });
    assertEquals((yield* store.getModelPool("p"))?.name, "P");
    yield* store.deleteModelPool("p");
    assertEquals(yield* store.getModelPool("p"), undefined);

    yield* store.savePrompt({ key: "k", body: "b" });
    assertEquals((yield* store.getPrompt("k"))?.body, "b");
    yield* store.deletePrompt("k");
    assertEquals(yield* store.getPrompt("k"), undefined);

    yield* store.saveCategory({ id: "c", label: "C" });
    assertEquals((yield* store.getCategory("c"))?.label, "C");
    yield* store.deleteCategory("c");
    assertEquals(yield* store.getCategory("c"), undefined);

    const pass = {
      id: "r",
      name: "R",
      systemPromptKey: "sys",
      modelPoolId: "p",
      units: [{ id: "analyze", promptKey: "sys" }],
    };
    yield* store.saveReviewPass(pass);
    assertEquals((yield* store.getReviewPass("r"))?.name, "R");
    yield* store.deleteReviewPass("r");
    assertEquals(yield* store.getReviewPass("r"), undefined);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("ReviewConfig -- getCategories splits found and missing ids", async () => {
  const program = Effect.gen(function* () {
    const store = yield* ReviewConfig;
    yield* store.saveCategory({ id: "a", label: "A" });
    yield* store.saveCategory({ id: "b", label: "B" });

    const [found, missing] = yield* store.getCategories(["a", "ghost", "b"]);

    assertEquals(found, [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ]);
    assertEquals(missing, ["ghost"]);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("ReviewConfig -- active pin set and clear", async () => {
  const program = Effect.gen(function* () {
    const store = yield* ReviewConfig;
    yield* store.saveReviewPass({
      id: "essay-review",
      name: "Essay review",
      systemPromptKey: "sys",
      modelPoolId: "pool",
      units: [{ id: "analyze", promptKey: "sys" }],
    });

    yield* store.setActiveReviewPass("essay-review");
    assertEquals(yield* store.getActiveReviewPassId(), "essay-review");

    yield* store.clearActiveReviewPass();
    assertEquals(yield* store.getActiveReviewPassId(), undefined);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});

Deno.test("ReviewConfig -- list helpers", async () => {
  const program = Effect.gen(function* () {
    const store = yield* ReviewConfig;
    yield* store.saveModelPool({ id: "p", name: "P", models: ["m/a"] });
    yield* store.savePrompt({ key: "k", body: "b" });
    yield* store.saveCategory({ id: "c", label: "C" });
    yield* store.saveReviewPass({
      id: "r",
      name: "R",
      systemPromptKey: "k",
      modelPoolId: "p",
      units: [{ id: "analyze", promptKey: "k" }],
    });

    assertEquals((yield* store.listModelPools()).length, 1);
    assertEquals((yield* store.listPrompts()).length, 1);
    assertEquals((yield* store.listCategories()).length, 1);
    assertEquals((yield* store.listReviewPasses()).length, 1);
  });
  await Effect.runPromise(Effect.provide(program, makeLayer()));
});
