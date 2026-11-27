import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Option } from "effect";
import { test } from "vitest";

import { ReviewConfig } from "#/config/service.ts";
import { category } from "#/config/testing.ts";
import { seedDemoFiles } from "#/demo.ts";
import { FileExistsError } from "#/files/types.ts";
import { Marks } from "#/marks/service.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import { runInWorkspace } from "#/reviews/testing.ts";

const categoriesOf = Effect.gen(function* () {
  const [run] = yield* ReviewRuns.use((runs) => runs.listRuns());
  assertEquals(run.status, "completed");
  const placed = yield* Marks.use((marks) => marks.ofRun(run.id));
  return placed.map((mark) => Option.getOrUndefined(mark.categoryId));
});

test("seedDemoFiles -- creates the essay with a completed review of every demo mark", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      for (const id of ["thesis", "structure", "evidence", "tone"]) {
        yield* config.saveCategory(category({ id, label: id }));
      }
      yield* seedDemoFiles();
      // grammar is the category every test database has
      assertEquals(yield* categoriesOf, [
        "thesis",
        "structure",
        "evidence",
        undefined,
        "tone",
        "grammar",
      ]);
    }),
  );
});

test("seedDemoFiles -- a category the config lacks leaves its mark uncategorised", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      yield* seedDemoFiles();
      assertEquals(yield* categoriesOf, [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "grammar",
      ]);
    }),
  );
});

test("seedDemoFiles -- seeding again is refused and changes nothing", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      yield* seedDemoFiles();
      assertInstanceOf(yield* Effect.flip(seedDemoFiles()), FileExistsError);
      assertEquals((yield* ReviewRuns.use((runs) => runs.listRuns())).length, 1);
    }),
  );
});
