import { assertEquals } from "@std/assert";
import { Effect, Option } from "effect";
import { test } from "vitest";

import { Marks } from "#/marks/service.ts";
import { testLayerD1 } from "#/persistence/testing/d1.ts";
import { reviewedFile, runInWorkspace } from "#/reviews/testing.ts";

import { layerReviewConfigD1 } from "./config_d1.ts";
import { ReviewConfig } from "./service.ts";
import { category, reviewPass } from "./testing.ts";
import { ConfigMissingError } from "./types.ts";

const run = <A, E>(program: Effect.Effect<A, E, ReviewConfig>) =>
  Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));

/** The `what` of the ConfigMissingError a lookup fails with. */
const missing = <A, R>(lookup: Effect.Effect<A, ConfigMissingError, R>) =>
  Effect.map(Effect.flip(lookup), (error) => error.what);

const pass = (id: string, name = "Pass", variables?: Record<string, string>) =>
  reviewPass({
    id,
    name,
    variables,
    systemPromptKey: "sys",
    modelPoolId: "pool",
    units: [{ id: "analyze", promptKey: "sys" }],
  });

test("ReviewConfig -- saves, reads back, replaces and deletes each kind", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveModelPool({ id: "p", name: "P", models: ["m/a", "m/b"] });
      yield* config.savePrompt({ key: "k", body: "Hello {{name}}" });
      yield* config.saveCategory(category({ id: "c", label: "C", color: "teal" }));
      yield* config.saveReviewPass(pass("r", "Pass", { name: "Ada" }));

      assertEquals((yield* config.getModelPool("p")).models, ["m/a", "m/b"]);
      assertEquals((yield* config.getPrompt("k")).body, "Hello {{name}}");
      const saved = yield* config.getCategory("c");
      assertEquals([saved.color, saved.description], [Option.some("teal"), Option.none()]);
      const savedPass = yield* config.getReviewPass("r");
      assertEquals(savedPass.units, [{ id: "analyze", promptKey: "sys" }]);
      assertEquals(savedPass.variables, Option.some({ name: "Ada" }));

      yield* config.saveCategory(category({ id: "c", label: "Renamed" }));
      assertEquals((yield* config.getCategory("c")).label, "Renamed");

      yield* config.deleteModelPool("p");
      yield* config.deletePrompt("k");
      yield* config.deleteCategory("c");
      yield* config.deleteReviewPass("r");
      assertEquals(
        [
          yield* missing(config.getModelPool("p")),
          yield* missing(config.getPrompt("k")),
          yield* missing(config.getCategory("c")),
          yield* missing(config.getReviewPass("r")),
        ],
        ['model pool "p"', 'prompt "k"', 'category "c"', 'review pass "r"'],
      );
    }),
  );
});

test("ReviewConfig -- lists are ordered by id", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveCategory(category({ id: "b", label: "B" }));
      yield* config.saveCategory(category({ id: "a", label: "A" }));
      yield* config.saveReviewPass(pass("z"));
      yield* config.saveReviewPass(pass("y"));
      assertEquals(
        (yield* config.listCategories()).map((found) => found.id),
        ["a", "b"],
      );
      assertEquals(
        (yield* config.listReviewPasses()).map((found) => found.id),
        ["y", "z"],
      );
    }),
  );
});

test("ReviewConfig -- getCategories keeps the order, and names every missing id", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveCategory(category({ id: "a", label: "A" }));
      yield* config.saveCategory(category({ id: "b", label: "B" }));
      assertEquals(
        (yield* config.getCategories(["b", "a"])).map((found) => found.id),
        ["b", "a"],
      );
      assertEquals(
        yield* missing(config.getCategories(["b", "ghost", "a", "gone"])),
        'categories "ghost", "gone"',
      );
      assertEquals(yield* config.getCategories([]), []);
    }),
  );
});

test("ReviewConfig -- a single pass is active at a time", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveReviewPass(pass("a"));
      yield* config.saveReviewPass(pass("b"));
      assertEquals(yield* config.getActiveReviewPassId(), Option.none());

      assertEquals(yield* config.setActiveReviewPass("a"), true);
      assertEquals(yield* config.setActiveReviewPass("b"), true);
      assertEquals(yield* config.getActiveReviewPassId(), Option.some("b"));

      // a missing pass leaves the active one as it is
      assertEquals(yield* config.setActiveReviewPass("ghost"), false);
      assertEquals(yield* config.getActiveReviewPassId(), Option.some("b"));

      yield* config.clearActiveReviewPass();
      assertEquals(yield* config.getActiveReviewPassId(), Option.none());
    }),
  );
});

test("ReviewConfig -- saving the active pass keeps it; deleting it leaves none", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveReviewPass(pass("a"));
      yield* config.setActiveReviewPass("a");
      yield* config.saveReviewPass(pass("a", "Renamed"));
      assertEquals(yield* config.getActiveReviewPassId(), Option.some("a"));
      yield* config.deleteReviewPass("a");
      assertEquals(yield* config.getActiveReviewPassId(), Option.none());
    }),
  );
});

test("ReviewConfig -- deleting a category leaves its marks uncategorised", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const { file, version, run: reviewRun } = yield* reviewedFile();
      const marks = yield* Marks;
      yield* marks.mark({
        fileId: file.id,
        versionId: version.id,
        runId: reviewRun.id,
        selectedText: "hello",
        comment: "a note",
        categoryId: "grammar",
      });
      yield* ReviewConfig.use((config) => config.deleteCategory("grammar"));
      const [mark] = yield* marks.ofRun(reviewRun.id);
      assertEquals(mark.categoryId, Option.none());
    }),
  );
});
