import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { assertEquals } from "@std/assert";
import { Effect, Layer, Option } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { test } from "vitest";

import { ReviewConfig } from "#/config/service.ts";
import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import { testLayer } from "#/persistence/testing/kv.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { loadProgressFeed } from "./progress_feed.ts";
import { TraceEvents } from "./trace/service.ts";
import { layerTraceEventsD1 } from "./trace/trace_d1.ts";
import { ReviewRun } from "./types.ts";

const run = <A>(program: Effect.Effect<A, unknown, ReviewConfig | TraceEvents>): Promise<A> => {
  const db = new DatabaseSync(":memory:");
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* D1Client.make({ db: d1SqliteShim(db) });
      const layers = Layer.mergeAll(
        layerTraceEventsD1(client),
        testLayer(ReviewConfig.layerNoDeps),
      );
      return yield* Effect.provide(program, layers);
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  ).finally(() => {
    db.close();
  });
};

const reviewRun = (reviewPassId: string) =>
  new ReviewRun({
    id: "run",
    wsId: "ws",
    path: "essay.md",
    reviewPassId,
    versionId: "v1",
    status: "running",
    startedAt: 0,
    completedAt: Option.none(),
    error: Option.none(),
    summary: Option.none(),
    leaseOwner: Option.none(),
    heartbeatAt: Option.none(),
  });

const storeTrace = Effect.gen(function* () {
  const traces = yield* TraceEvents;
  yield* Effect.provideService(
    Effect.gen(function* () {
      yield* traces.append("run", { seq: 0, at: 0, type: "node_start", nodeId: "analyze" });
      yield* traces.append("run", {
        seq: 1,
        at: 1,
        type: "custom",
        nodeId: "mechanics.apply",
        event: { type: "applied", attempts: [{ selected_text: "a", comment: "c", marked: true }] },
      });
    }),
    WorkspaceId,
    { wsId: "ws" },
  );
});

test("loadProgressFeed -- folds the stored trace over the units of the run's own pass", async () => {
  await run(
    Effect.gen(function* () {
      const config = yield* ReviewConfig;
      yield* config.saveModelPool({ id: "pool", name: "Pool", models: ["m/a"] });
      yield* config.savePrompt({ key: "system", body: "You are an editor." });
      yield* config.savePrompt({ key: "analyze", body: "Read it." });
      yield* config.saveReviewPass({
        id: "pass",
        name: "Pass",
        systemPromptKey: "system",
        modelPoolId: "pool",
        units: [{ id: "analyze", promptKey: "analyze" }],
      });
      yield* storeTrace;

      const feed = yield* loadProgressFeed(reviewRun("pass"));
      assertEquals(feed.seq, 1);
      assertEquals(feed.progress, {
        units: [{ id: "analyze", state: "running" }],
        marksPlaced: 1,
      });
    }),
  );
});

test("loadProgressFeed -- a pass that doesn't exist leaves no units, marks still count", async () => {
  await run(
    Effect.gen(function* () {
      yield* storeTrace;
      const feed = yield* loadProgressFeed(reviewRun("gone"));
      assertEquals(feed.progress, { units: [], marksPlaced: 1 });
    }),
  );
});
