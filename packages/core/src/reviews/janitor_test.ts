import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { assertEquals } from "@std/assert";
import { Duration, Effect, Layer } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { TestClock } from "effect/testing";
import { test } from "vitest";

import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import type { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewJanitor } from "./janitor.ts";
import { layerReviewJanitorD1 } from "./janitor_d1.ts";
import { layerReviewRunsD1 } from "./runs_d1.ts";
import { ReviewRunMissingError, ReviewRuns } from "./service.ts";

const STALE_MS = 15 * 60_000;

const run = <A>(
  program: Effect.Effect<
    A,
    PersistenceError | ReviewRunMissingError,
    ReviewRuns | ReviewJanitor | WorkspaceId
  >,
): Promise<A> => {
  const db = new DatabaseSync(":memory:");
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* D1Client.make({ db: d1SqliteShim(db) });
      const layers = Layer.mergeAll(
        layerReviewRunsD1(client),
        layerReviewJanitorD1(client),
        TestClock.layer(),
      );
      return yield* Effect.provide(
        Effect.provideService(program, WorkspaceId, { wsId: "ws" }),
        layers,
      );
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  ).finally(() => {
    db.close();
  });
};

test("ReviewJanitor -- a run that was never claimed is swept", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const janitor = yield* ReviewJanitor;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });

      const refs = yield* janitor.staleRuns(STALE_MS);
      assertEquals(refs, [{ runId: created.id, wsId: "ws" }]);
    }),
  );
});

test("ReviewJanitor -- a live lease is not swept; it goes stale and settles", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const janitor = yield* ReviewJanitor;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });
      yield* runs.claimRun(created.id, { owner: "driver-a", heartbeatAtLeast: 0 });

      assertEquals(yield* janitor.staleRuns(STALE_MS), []);

      yield* TestClock.adjust(Duration.millis(STALE_MS + 60_000));
      assertEquals(
        (yield* janitor.staleRuns(STALE_MS)).map((ref) => ref.runId),
        [created.id],
      );

      yield* runs.completeRun(created.id, "done");
      assertEquals(yield* janitor.staleRuns(STALE_MS), []);
    }),
  );
});

test("ReviewJanitor -- the sweep is global across workspaces", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const janitor = yield* ReviewJanitor;
      const a = yield* runs.createRun({ path: "a.txt", versionId: "v1", reviewPassId: "pass" });
      yield* TestClock.adjust(Duration.minutes(1));
      const b = yield* Effect.provideService(
        runs.createRun({ path: "b.txt", versionId: "v1", reviewPassId: "pass" }),
        WorkspaceId,
        { wsId: "other" },
      );

      const refs = yield* janitor.staleRuns(STALE_MS);
      assertEquals(refs, [
        { runId: a.id, wsId: "ws" },
        { runId: b.id, wsId: "other" },
      ]);
    }),
  );
});
