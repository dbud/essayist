import { assertEquals } from "@std/assert";
import { Effect } from "effect";
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
