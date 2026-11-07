import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { assert, assertEquals, assertRejects } from "@std/assert";
import { Clock, Duration, Effect, Option } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { TestClock } from "effect/testing";
import { test } from "vitest";

import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import type { PersistenceError } from "#/persistence/mod.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { layerReviewRunsD1 } from "./runs_d1.ts";
import { ReviewRunMissingError, ReviewRuns } from "./service.ts";

const run = <A>(
  program: Effect.Effect<A, PersistenceError | ReviewRunMissingError, ReviewRuns | WorkspaceId>,
  onClock: boolean = false,
): Promise<A> => {
  const db = new DatabaseSync(":memory:");
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* D1Client.make({ db: d1SqliteShim(db) });
      return yield* Effect.provide(
        Effect.provideService(
          onClock ? Effect.provide(program, TestClock.layer()) : program,
          WorkspaceId,
          { wsId: "ws" },
        ),
        layerReviewRunsD1(client),
      );
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  ).finally(() => {
    db.close();
  });
};

/** Like run, with the program clock under the test clock. */
const runOnClock = <A>(
  program: Effect.Effect<A, PersistenceError, ReviewRuns | WorkspaceId>,
): Promise<A> => run(program, true);

test("ReviewRuns -- createRun + getRun", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "essay-review",
      });
      assertEquals(created.status, "running");
      assertEquals(created.path, "essay.txt");
      assertEquals(created.reviewPassId, "essay-review");
      assertEquals(created.versionId, "v1");

      const fetched = yield* runs.getRun(created.id);
      assertEquals(fetched.id, created.id);
    }),
  );
});

test("ReviewRuns.listRuns -- newest first", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* runs.createRun({
        path: "a.txt",
        versionId: "v1",
        reviewPassId: "pass",
        startedAt: 100,
      });
      const b = yield* runs.createRun({
        path: "b.txt",
        versionId: "v1",
        reviewPassId: "pass",
        startedAt: 200,
      });

      const list = yield* runs.listRuns();
      assertEquals(list.length, 2);
      assertEquals(list[0].id, b.id);
      assertEquals(list[1].id, a.id);
    }),
  );
});

test("ReviewRuns.listRuns -- filters by path", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* runs.createRun({
        path: "a.txt",
        versionId: "v1",
        reviewPassId: "pass",
        startedAt: 100,
      });
      yield* runs.createRun({
        path: "b.txt",
        versionId: "v1",
        reviewPassId: "pass",
        startedAt: 200,
      });
      const a2 = yield* runs.createRun({
        path: "a.txt",
        versionId: "v1",
        reviewPassId: "pass",
        startedAt: 300,
      });

      const aRuns = yield* runs.listRuns("a.txt");
      assertEquals(aRuns.length, 2);
      assertEquals(aRuns[0].id, a2.id);
      assertEquals(aRuns[1].id, a.id);

      const bRuns = yield* runs.listRuns("b.txt");
      assertEquals(bRuns.length, 1);
    }),
  );
});

test("ReviewRuns.listRuns -- is workspace-scoped", async () => {
  await run(
    Effect.provideService(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        yield* runs.createRun({ path: "a.txt", versionId: "v1", reviewPassId: "pass" });
      }),
      WorkspaceId,
      { wsId: "ws1" },
    ),
  );
  await run(
    Effect.provideService(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        yield* runs.createRun({ path: "b.txt", versionId: "v1", reviewPassId: "pass" });
      }),
      WorkspaceId,
      { wsId: "ws2" },
    ),
  );
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      // ws "default" (the run helper's scope) sees neither run.
      assertEquals(yield* runs.listRuns(), []);
    }),
  );
});

test("ReviewRuns.completeRun -- sets status, summary, completedAt", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });

      const completed = yield* runs.completeRun(created.id, "Looks good.");
      assertEquals(completed.status, "completed");
      assertEquals(completed.summary, Option.some("Looks good."));
      assert(Option.isSome(completed.completedAt));
      assertEquals((yield* runs.getRun(created.id)).status, "completed");
    }),
  );
});

test("ReviewRuns.failRun -- sets status and error", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });

      const failed = yield* runs.failRun(created.id, "boom");
      assertEquals(failed.status, "failed");
      assertEquals(failed.error, Option.some("boom"));
    }),
  );
});

test("ReviewRuns.getRun -- unknown id fails with ReviewRunMissingError", async () => {
  await assertRejects(
    () =>
      run(
        Effect.gen(function* () {
          const runs = yield* ReviewRuns;
          return yield* runs.getRun("nope");
        }),
      ),
    ReviewRunMissingError,
    "No run nope",
  );
});

test("ReviewRuns.completeRun/failRun -- unknown id fail with ReviewRunMissingError", async () => {
  await assertRejects(
    () =>
      run(
        Effect.gen(function* () {
          const runs = yield* ReviewRuns;
          return yield* runs.completeRun("nope", "x");
        }),
      ),
    ReviewRunMissingError,
  );
  await assertRejects(
    () =>
      run(
        Effect.gen(function* () {
          const runs = yield* ReviewRuns;
          return yield* runs.failRun("nope", "x");
        }),
      ),
    ReviewRunMissingError,
  );
});

// claim and heartbeat

test("ReviewRuns.claimRun -- leases the run", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });

      const claimedRow = Option.getOrUndefined(
        yield* runs.claimRun(created.id, {
          owner: "driver-a",
          heartbeatAtLeast: 0,
        }),
      );
      assertEquals(claimedRow?.leaseOwner, Option.some("driver-a"));
      // Another workspace scope cannot claim it at all.
      yield* Effect.provideService(
        Effect.gen(function* () {
          const runsOther = yield* ReviewRuns;
          assertEquals(
            yield* runsOther.claimRun(created.id, {
              owner: "driver-b",
              heartbeatAtLeast: 0,
            }),
            Option.none(),
          );
        }),
        WorkspaceId,
        { wsId: "other" },
      );
    }),
  );
});

test("ReviewRuns.claimRun -- none for an unknown run", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      assertEquals(
        yield* runs.claimRun("nope", {
          owner: "driver-a",
          heartbeatAtLeast: 0,
        }),
        Option.none(),
      );
    }),
  );
});

test("ReviewRuns.claimRun -- takes over a stale lease", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });
      yield* runs.claimRun(created.id, {
        owner: "driver-a",
        heartbeatAtLeast: 0,
      });

      // driver-b demands fresher proof of life than the current heartbeat, so the lease counts as
      // stale and the takeover succeeds.
      const takeoverRow = Option.getOrUndefined(
        yield* runs.claimRun(created.id, {
          owner: "driver-b",
          heartbeatAtLeast: Date.now() + 1_000,
        }),
      );
      assertEquals(takeoverRow?.leaseOwner, Option.some("driver-b"));
    }),
  );
});

test("ReviewRuns -- a lease ages out with the clock", async () => {
  await runOnClock(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });
      yield* runs.claimRun(created.id, {
        owner: "driver-a",
        heartbeatAtLeast: 0,
      });
      const claimedAt = yield* Clock.currentTimeMillis;

      // A heartbeat at least as fresh as demanded keeps the lease.
      assertEquals(
        yield* runs.claimRun(created.id, {
          owner: "driver-b",
          heartbeatAtLeast: claimedAt,
        }),
        Option.none(),
      );

      // Past the window the lease goes stale: the driver again demands proof of life in the last 15
      // minutes, and the clock says the heartbeat is 16 minutes old.
      yield* TestClock.adjust(Duration.minutes(16));
      const takeoverRow = Option.getOrUndefined(
        yield* runs.claimRun(created.id, {
          owner: "driver-b",
          heartbeatAtLeast: (yield* Clock.currentTimeMillis) - 15 * 60_000,
        }),
      );
      assertEquals(takeoverRow?.leaseOwner, Option.some("driver-b"));
    }),
  );
});

test("ReviewRuns.heartbeatRun -- renews only our own lease", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        versionId: "v1",
        reviewPassId: "pass",
      });

      assertEquals(yield* runs.heartbeatRun(created.id, "driver-a"), false);

      yield* runs.claimRun(created.id, {
        owner: "driver-a",
        heartbeatAtLeast: 0,
      });

      assertEquals(yield* runs.heartbeatRun(created.id, "driver-a"), true);
      assertEquals(yield* runs.heartbeatRun(created.id, "driver-b"), false);
      const heartbeatRow = yield* runs.getRun(created.id);
      assertEquals(heartbeatRow.leaseOwner, Option.some("driver-a"));
    }),
  );
});

test("ReviewRuns.heartbeatRun -- false for an unknown run", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      assertEquals(yield* runs.heartbeatRun("nope", "driver-a"), false);
    }),
  );
});

test("ReviewRuns -- completing and failing a run releases its lease", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* runs.createRun({ path: "a.txt", versionId: "v1", reviewPassId: "pass" });
      const b = yield* runs.createRun({ path: "b.txt", versionId: "v1", reviewPassId: "pass" });
      yield* runs.claimRun(a.id, { owner: "driver-a", heartbeatAtLeast: 0 });
      yield* runs.claimRun(b.id, { owner: "driver-a", heartbeatAtLeast: 0 });

      yield* runs.completeRun(a.id, "ok");
      yield* runs.failRun(b.id, "boom");

      const releasedA = yield* runs.getRun(a.id);
      const releasedB = yield* runs.getRun(b.id);
      assertEquals(releasedA.leaseOwner, Option.none());
      assertEquals(releasedA.heartbeatAt, Option.none());
      assertEquals(releasedB.leaseOwner, Option.none());
      assertEquals(releasedB.heartbeatAt, Option.none());
    }),
  );
});
