import { openKv } from "@deno/kv";
import * as D1Client from "@effect/sql-d1/D1Client";
import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { test } from "vitest";

import { Files } from "#/files/service.ts";
import { Marks } from "#/marks/service.ts";
import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import { kvLayer } from "#/persistence/kv_layer.ts";
import { migratedDatabase } from "#/persistence/testing/d1.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { ReviewCleanup } from "./cleanup.ts";
import { layerReviewRunsD1 } from "./runs_d1.ts";
import { ReviewRuns } from "./service.ts";
import { TraceEvents } from "./trace/service.ts";
import { layerTraceEventsD1 } from "./trace/trace_d1.ts";

const PATH = "essay.txt";

const run = async <A>(
  program: Effect.Effect<
    A,
    unknown,
    ReviewCleanup | ReviewRuns | TraceEvents | Files | Marks | WorkspaceId
  >,
): Promise<A> => {
  const kv = await openKv();
  const db = migratedDatabase();
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* D1Client.make({ db: d1SqliteShim(db) });
      const storage = Layer.mergeAll(
        layerReviewRunsD1(client),
        layerTraceEventsD1(client),
        Layer.provide(Files.layerNoDeps, kvLayer(kv)),
      );
      const layers = Layer.mergeAll(
        storage,
        Layer.provide(ReviewCleanup.layerNoDeps, storage),
        Layer.provide(Marks.layerNoDeps, storage),
      );
      return yield* Effect.provide(
        Effect.provideService(program, WorkspaceId, { wsId: "ws" }),
        layers,
      );
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  ).finally(() => {
    db.close();
    kv.close();
  });
};

/** A settled run on the latest version, with a single trace event and a mark on `text`. */
const reviewed = (text: string) =>
  Effect.gen(function* () {
    const files = yield* Files;
    const runs = yield* ReviewRuns;
    const traces = yield* TraceEvents;
    const marks = yield* Marks;
    const { version_id } = yield* files.read(PATH);
    const created = yield* runs.createRun({
      path: PATH,
      versionId: version_id,
      reviewPassId: "pass",
    });
    yield* traces.append(created.id, { seq: 1, at: 1, type: "node_start", nodeId: "n" });
    yield* marks.mark(PATH, text, "comment", {
      provenance: { runId: created.id, unitId: "unit" },
    });
    yield* runs.completeRun(created.id, "done");
    return { runId: created.id, versionId: version_id };
  });

const markTexts = (versionId: string) =>
  Effect.gen(function* () {
    const files = yield* Files;
    const marks = yield* files.getMarks(PATH, versionId);
    return marks.map((mark) => mark.selected_text).toSorted();
  });

const runIds = Effect.gen(function* () {
  const runs = yield* ReviewRuns;
  return (yield* runs.listRuns(PATH)).map((r) => r.id).toSorted();
});

test("ReviewCleanup.deleteRun -- removes the run, its trace, and its marks on every version", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const traces = yield* TraceEvents;
      const cleanup = yield* ReviewCleanup;
      yield* files.write(PATH, "alpha beta gamma");
      const a = yield* reviewed("alpha");
      const b = yield* reviewed("beta");
      const { version_id: v2 } = yield* files.write(PATH, "alpha beta gamma delta");

      assertEquals(yield* markTexts(v2), ["alpha", "beta"]);

      const result = yield* cleanup.deleteRun(a.runId);

      assertEquals(result, { runs: 1, marks: 2 });
      assertEquals(yield* markTexts(a.versionId), ["beta"]);
      assertEquals(yield* markTexts(v2), ["beta"]);
      assertEquals(yield* traces.get(a.runId), []);
      assertEquals(yield* runIds, [b.runId]);
    }),
  );
});

test("ReviewCleanup.clearVersion -- wipes the version and its runs, keeps earlier versions", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const cleanup = yield* ReviewCleanup;
      yield* files.write(PATH, "alpha beta gamma");
      const a = yield* reviewed("alpha");
      yield* files.write(PATH, "alpha beta gamma delta");
      const b = yield* reviewed("beta");

      const result = yield* cleanup.clearVersion(PATH, b.versionId);

      // run b's mark plus the copy of run a's mark on v2
      assertEquals(result, { runs: 1, marks: 2 });
      assertEquals(yield* markTexts(b.versionId), []);
      assertEquals(yield* markTexts(a.versionId), ["alpha"]);
      assertEquals(yield* runIds, [a.runId]);
    }),
  );
});

test("ReviewCleanup.clearFile -- removes every run and mark of the file", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const cleanup = yield* ReviewCleanup;
      yield* files.write(PATH, "alpha beta gamma");
      const a = yield* reviewed("alpha");
      yield* files.write(PATH, "alpha beta gamma delta");
      const b = yield* reviewed("beta");

      const result = yield* cleanup.clearFile(PATH);

      assertEquals(result, { runs: 2, marks: 3 });
      assertEquals(yield* markTexts(a.versionId), []);
      assertEquals(yield* markTexts(b.versionId), []);
      assertEquals(yield* runIds, []);
    }),
  );
});

test("ReviewCleanup -- a running run in scope refuses the cleanup and deletes nothing", async () => {
  await run(
    Effect.gen(function* () {
      const files = yield* Files;
      const runs = yield* ReviewRuns;
      const cleanup = yield* ReviewCleanup;
      const { version_id } = yield* files.write(PATH, "alpha beta gamma");
      const a = yield* reviewed("alpha");
      const active = yield* runs.createRun({
        path: PATH,
        versionId: version_id,
        reviewPassId: "pass",
      });

      const error = yield* Effect.flip(cleanup.clearVersion(PATH, version_id));

      assertEquals(error._tag, "ReviewRunActiveError");
      assertEquals(yield* markTexts(version_id), ["alpha"]);
      assertEquals(yield* runIds, [a.runId, active.id].toSorted());
    }),
  );
});

test("ReviewCleanup.deleteRun -- a missing run fails with ReviewRunMissingError", async () => {
  await run(
    Effect.gen(function* () {
      const cleanup = yield* ReviewCleanup;
      const error = yield* Effect.flip(cleanup.deleteRun("ghost"));
      assertEquals(error._tag, "ReviewRunMissingError");
    }),
  );
});
