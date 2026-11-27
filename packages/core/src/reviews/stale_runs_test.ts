import { assertEquals } from "@std/assert";
import { Duration, Effect } from "effect";
import { TestClock } from "effect/testing";
import { test } from "vitest";

import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewRuns } from "./service.ts";
import { reviewedFile, runInWorkspace } from "./testing.ts";

const STALE_MS = 15 * 60_000;

const staleRuns = ReviewRuns.use((runs) => runs.staleRuns(STALE_MS));

test("ReviewRuns.staleRuns -- a run that was never claimed is swept", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const { run } = yield* reviewedFile();
      const { wsId } = yield* WorkspaceId;
      assertEquals(yield* staleRuns, [{ runId: run.id, wsId }]);
    }),
  );
});

test("ReviewRuns.staleRuns -- a live lease is not swept; it goes stale and settles", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const { run } = yield* reviewedFile();
      yield* runs.claimRun(run.id, { owner: "driver-a", staleMs: STALE_MS });
      assertEquals(yield* staleRuns, []);

      yield* TestClock.adjust(Duration.millis(STALE_MS + 60_000));
      assertEquals(
        (yield* staleRuns).map((ref) => ref.runId),
        [run.id],
      );

      yield* runs.completeRun(run.id, "done");
      assertEquals(yield* staleRuns, []);
    }).pipe(Effect.provide(TestClock.layer())),
  );
});

test("ReviewRuns.staleRuns -- the sweep is global across workspaces, oldest first", async () => {
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const a = yield* reviewedFile();
      yield* TestClock.adjust(Duration.minutes(1));
      const b = yield* other(reviewedFile());
      const home = yield* WorkspaceId;
      const away = yield* other(WorkspaceId);
      assertEquals(yield* staleRuns, [
        { runId: a.run.id, wsId: home.wsId },
        { runId: b.run.id, wsId: away.wsId },
      ]);
    }).pipe(Effect.provide(TestClock.layer())),
  );
});
