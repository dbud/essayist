import { assertEquals } from "@std/assert";
import { Clock, Duration, Effect } from "effect";
import { TestClock } from "effect/testing";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { testLayer } from "@/persistence/testing/kv.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import { ReviewRuns } from "./service.ts";

type E = PersistenceError | ConcurrentModificationError;

const run = <A>(
  program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>,
): Promise<A> =>
  Effect.runPromise(
    Effect.provide(
      Effect.provideService(program, WorkspaceId, { wsId: "ws" }),
      testLayer(ReviewRuns.layerNoDeps),
    ),
  );

/** Like run, with the program clock under the test clock. */
const runOnClock = <A>(
  program: Effect.Effect<A, E, ReviewRuns | WorkspaceId>,
): Promise<A> => run(Effect.provide(program, TestClock.layer()));

Deno.test("ReviewRuns.createRun + getRun", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        reviewPassId: "essay-review",
      });
      assertEquals(created.status, "running");
      assertEquals(created.path, "essay.txt");
      assertEquals(created.reviewPassId, "essay-review");

      const fetched = yield* runs.getRun(created.id);
      assertEquals(fetched?.id, created.id);
    }),
  );
});

Deno.test("ReviewRuns.createRun stores versionId when given", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        reviewPassId: "essay-review",
        versionId: "v1",
      });
      assertEquals(created.versionId, "v1");

      const plain = yield* runs.createRun({
        path: "essay.txt",
        reviewPassId: "essay-review",
      });
      assertEquals(plain.versionId, undefined);
    }),
  );
});

Deno.test("ReviewRuns.listRuns newest first", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* runs.createRun({
        path: "a.txt",
        reviewPassId: "pass",
        startedAt: 100,
      });
      const b = yield* runs.createRun({
        path: "b.txt",
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

Deno.test("ReviewRuns.listRuns filters by path", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* runs.createRun({
        path: "a.txt",
        reviewPassId: "pass",
        startedAt: 100,
      });
      yield* runs.createRun({
        path: "b.txt",
        reviewPassId: "pass",
        startedAt: 200,
      });
      const a2 = yield* runs.createRun({
        path: "a.txt",
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

Deno.test("ReviewRuns.listRuns is workspace-scoped", async () => {
  await run(
    Effect.provideService(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        yield* runs.createRun({ path: "a.txt", reviewPassId: "pass" });
      }),
      WorkspaceId,
      { wsId: "ws1" },
    ),
  );
  await run(
    Effect.provideService(
      Effect.gen(function* () {
        const runs = yield* ReviewRuns;
        yield* runs.createRun({ path: "b.txt", reviewPassId: "pass" });
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

// end-state ops (claim and heartbeat land in the next commit; the
// lease-release test rides there too)

Deno.test("ReviewRuns.completeRun sets status, summary, completedAt", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
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

Deno.test("ReviewRuns.failRun sets status and error", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        reviewPassId: "pass",
      });

      const failed = yield* runs.failRun(created.id, "boom");
      assertEquals(failed?.status, "failed");
      assertEquals(failed?.error, "boom");
    }),
  );
});

Deno.test("ReviewRuns.completeRun/failRun unknown id return undefined", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      assertEquals(yield* runs.completeRun("nope", "x"), undefined);
      assertEquals(yield* runs.failRun("nope", "x"), undefined);
    }),
  );
});

// claim and heartbeat

Deno.test("ReviewRuns.claimRun leases the run", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
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

Deno.test("ReviewRuns.claimRun -- undefined for an unknown run", async () => {
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

Deno.test("ReviewRuns.claimRun -- takes over a stale lease", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
        reviewPassId: "pass",
      });
      yield* runs.claimRun(created.id, {
        owner: "driver-a",
        heartbeatAtLeast: 0,
      });

      // driver-b demands fresher proof of life than the current heartbeat,
      // so the lease counts as stale and the takeover succeeds.
      const takeover = yield* runs.claimRun(created.id, {
        owner: "driver-b",
        heartbeatAtLeast: Date.now() + 1_000,
      });

      assertEquals(takeover?.leaseOwner, "driver-b");
    }),
  );
});

Deno.test("ReviewRuns.claimRun -- a lease ages out with the clock", async () => {
  await runOnClock(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
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

      // Past the window the lease goes stale: the driver again demands
      // proof of life in the last 15 minutes, and the clock says the
      // heartbeat is 16 minutes old.
      yield* TestClock.adjust(Duration.minutes(16));
      const takeover = yield* runs.claimRun(created.id, {
        owner: "driver-b",
        heartbeatAtLeast: (yield* Clock.currentTimeMillis) - 15 * 60_000,
      });
      assertEquals(takeover?.leaseOwner, "driver-b");
    }),
  );
});

Deno.test("ReviewRuns.heartbeatRun renews only our own lease", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const created = yield* runs.createRun({
        path: "essay.txt",
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

Deno.test("ReviewRuns.heartbeatRun -- false for an unknown run", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      assertEquals(yield* runs.heartbeatRun("nope", "driver-a"), false);
    }),
  );
});

Deno.test("ReviewRuns -- completing and failing a run releases its lease", async () => {
  await run(
    Effect.gen(function* () {
      const runs = yield* ReviewRuns;
      const a = yield* runs.createRun({ path: "a.txt", reviewPassId: "pass" });
      const b = yield* runs.createRun({ path: "b.txt", reviewPassId: "pass" });
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
