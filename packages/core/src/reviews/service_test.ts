import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { assertEquals } from "@std/assert";
import { Clock, Duration, Effect } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { TestClock } from "effect/testing";
import { test } from "vitest";

import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import type { ConcurrentModificationError, PersistenceError } from "#/persistence/mod.ts";
import { testLayer } from "#/persistence/testing/kv.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { layerReviewRunsD1 } from "./runs_d1.ts";
import { ReviewRuns } from "./service.ts";

type E = PersistenceError | ConcurrentModificationError;

/** Same service over the kv-compat table and over the review_runs D1 table. */
interface Backend {
  name: string;
  run: <A>(program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>, onClock?: boolean) => Promise<A>;
}

const kvBackend: Backend = {
  name: "kv",
  run: <A>(
    program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>,
    onClock: boolean = false,
  ): Promise<A> =>
    Effect.runPromise(
      Effect.provide(
        Effect.provideService(
          onClock ? Effect.provide(program, TestClock.layer()) : program,
          WorkspaceId,
          { wsId: "ws" },
        ),
        testLayer(ReviewRuns.layerNoDeps),
      ),
    ),
};

const d1Backend: Backend = {
  name: "d1",
  run: async <A>(
    program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>,
    onClock: boolean = false,
  ): Promise<A> => {
    const db = new DatabaseSync(":memory:");
    try {
      return await Effect.runPromise(
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
      );
    } finally {
      db.close();
    }
  },
};

for (const backend of [kvBackend, d1Backend]) {
  const run = <A>(program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>): Promise<A> =>
    backend.run(program);

  /** Like run, with the program clock under the test clock. */
  const runOnClock = <A>(program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>): Promise<A> =>
    backend.run(program, true);

  test(`ReviewRuns (${backend.name}) -- createRun + getRun`, async () => {
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
        assertEquals(fetched?.id, created.id);
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- listRuns newest first`, async () => {
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

  test(`ReviewRuns (${backend.name}) -- listRuns filters by path`, async () => {
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

  test(`ReviewRuns (${backend.name}) -- listRuns is workspace-scoped`, async () => {
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

  // claim and heartbeat

  test(`ReviewRuns (${backend.name}) -- completeRun sets status, summary, completedAt`, () => {
    return run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        const created = yield* runs.createRun({
          path: "essay.txt",
          versionId: "v1",
          reviewPassId: "pass",
        });

        const completed = yield* runs.completeRun(created.id, "Looks good.");
        assertEquals(completed?.status, "completed");
        assertEquals(completed?.summary, "Looks good.");
        assertEquals(typeof completed?.completedAt, "number");
        assertEquals((yield* runs.getRun(created.id))?.status, "completed");
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- failRun sets status and error`, async () => {
    await run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        const created = yield* runs.createRun({
          path: "essay.txt",
          versionId: "v1",
          reviewPassId: "pass",
        });

        const failed = yield* runs.failRun(created.id, "boom");
        assertEquals(failed?.status, "failed");
        assertEquals(failed?.error, "boom");
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- completeRun/failRun unknown id return undefined`, async () => {
    await run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        assertEquals(yield* runs.completeRun("nope", "x"), undefined);
        assertEquals(yield* runs.failRun("nope", "x"), undefined);
      }),
    );
  });

  // claim and heartbeat

  test(`ReviewRuns (${backend.name}) -- claimRun leases the run`, async () => {
    await run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        const created = yield* runs.createRun({
          path: "essay.txt",
          versionId: "v1",
          reviewPassId: "pass",
        });

        const claimed = yield* runs.claimRun(created.id, {
          owner: "driver-a",
          heartbeatAtLeast: 0,
        });

        assertEquals(claimed?.leaseOwner, "driver-a");
        assertEquals((yield* runs.getRun(created.id))?.leaseOwner, "driver-a");
        // Another workspace scope cannot claim it at all.
        yield* Effect.provideService(
          Effect.gen(function* () {
            const runsOther = yield* ReviewRuns;
            assertEquals(
              yield* runsOther.claimRun(created.id, {
                owner: "driver-b",
                heartbeatAtLeast: 0,
              }),
              undefined,
            );
          }),
          WorkspaceId,
          { wsId: "other" },
        );
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- claimRun, undefined for an unknown run`, async () => {
    await run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        assertEquals(
          yield* runs.claimRun("nope", {
            owner: "driver-a",
            heartbeatAtLeast: 0,
          }),
          undefined,
        );
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- claimRun takes over a stale lease`, async () => {
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
        const takeover = yield* runs.claimRun(created.id, {
          owner: "driver-b",
          heartbeatAtLeast: Date.now() + 1_000,
        });

        assertEquals(takeover?.leaseOwner, "driver-b");
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- a lease ages out with the clock`, async () => {
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
          undefined,
        );

        // Past the window the lease goes stale: the driver again demands proof of life in the last
        // 15 minutes, and the clock says the heartbeat is 16 minutes old.
        yield* TestClock.adjust(Duration.minutes(16));
        const takeover = yield* runs.claimRun(created.id, {
          owner: "driver-b",
          heartbeatAtLeast: (yield* Clock.currentTimeMillis) - 15 * 60_000,
        });
        assertEquals(takeover?.leaseOwner, "driver-b");
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- heartbeatRun renews only our own lease`, async () => {
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
        assertEquals((yield* runs.getRun(created.id))?.leaseOwner, "driver-a");
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- heartbeatRun, false for an unknown run`, async () => {
    await run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        assertEquals(yield* runs.heartbeatRun("nope", "driver-a"), false);
      }),
    );
  });

  test(`ReviewRuns (${backend.name}) -- completing and failing a run releases its lease`, async () => {
    await run(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        const a = yield* runs.createRun({ path: "a.txt", versionId: "v1", reviewPassId: "pass" });
        const b = yield* runs.createRun({ path: "b.txt", versionId: "v1", reviewPassId: "pass" });
        yield* runs.claimRun(a.id, { owner: "driver-a", heartbeatAtLeast: 0 });
        yield* runs.claimRun(b.id, { owner: "driver-a", heartbeatAtLeast: 0 });

        yield* runs.completeRun(a.id, "ok");
        yield* runs.failRun(b.id, "boom");

        const completed = yield* runs.getRun(a.id);
        assertEquals(completed?.leaseOwner, undefined);
        assertEquals(completed?.heartbeatAt, undefined);
        const failed = yield* runs.getRun(b.id);
        assertEquals(failed?.leaseOwner, undefined);
        assertEquals(failed?.heartbeatAt, undefined);
      }),
    );
  });
}
