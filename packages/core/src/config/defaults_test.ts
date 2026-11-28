import { assertEquals } from "@std/assert";
import { Effect, Option } from "effect";
import { test } from "vitest";

import { testLayerD1 } from "#/d1/testing.ts";

import { layerReviewConfigD1 } from "./config_d1.ts";
import { DEFAULT_REVIEW_PASS_ID, seedDefaultConfig } from "./defaults.ts";
import { resolveActiveReviewPass } from "./resolve.ts";
import { ReviewConfig } from "./service.ts";
import { category } from "./testing.ts";

const run = <A, E>(program: Effect.Effect<A, E, ReviewConfig>) =>
  Effect.runPromise(Effect.provide(program, testLayerD1(layerReviewConfigD1)));

test("seedDefaultConfig -- seeds an empty store with a pass that resolves", async () => {
  await run(
    Effect.gen(function* () {
      assertEquals(yield* seedDefaultConfig, true);
      const config = yield* ReviewConfig;
      assertEquals(yield* config.getActiveReviewPassId(), Option.some(DEFAULT_REVIEW_PASS_ID));
      assertEquals(
        (yield* config.listCategories()).map(({ id }) => id),
        ["evidence", "grammar", "structure", "thesis", "tone"],
      );
      // every prompt, pool and category the pass names exists
      const resolved = Option.getOrThrow(yield* resolveActiveReviewPass);
      assertEquals(resolved.units.length, 5);
    }),
  );
});

test("seedDefaultConfig -- a store with any config is left as it is", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveCategory(category({ id: "mine", label: "mine" }));
      assertEquals(yield* seedDefaultConfig, false);
      assertEquals(
        (yield* config.listCategories()).map(({ id }) => id),
        ["mine"],
      );
      assertEquals(yield* config.listReviewPasses(), []);
    }),
  );
});
