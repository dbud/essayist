import { assertEquals, assertInstanceOf } from "@std/assert";
import { Effect, Option } from "effect";
import { test } from "vitest";

import { seedDemoFiles } from "#/demo.ts";
import { FileExistsError } from "#/files/types.ts";
import { Marks } from "#/marks/service.ts";
import { ReviewRuns } from "#/reviews/service.ts";
import { runInWorkspace } from "#/reviews/testing.ts";

test("seedDemoFiles -- creates the essay with a completed review of every demo mark", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      yield* seedDemoFiles();
      const [run] = yield* ReviewRuns.use((runs) => runs.listRuns());
      assertEquals(run.status, "completed");
      const placed = yield* Marks.use((marks) => marks.ofRun(run.id));
      assertEquals(
        placed.map((mark) => Option.getOrUndefined(mark.categoryId)),
        ["thesis", "structure", "evidence", undefined, "tone", "grammar"],
      );
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
