/**
 * The TraceEvents D1 layer: events store as rows keyed (wsId, runId, seq), one event per round
 * trip.
 */

import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { test } from "vitest";

import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import type { PersistenceError } from "#/persistence/service.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { TraceEvents } from "./service.ts";
import { layerTraceEventsD1 } from "./trace_d1.ts";
import type { TraceEvent } from "./types.ts";

const run = <A>(
  program: Effect.Effect<A, PersistenceError, TraceEvents | WorkspaceId>,
): Promise<A> => {
  const db = new DatabaseSync(":memory:");
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* D1Client.make({ db: d1SqliteShim(db) });
      return yield* Effect.provide(
        Effect.provideService(program, WorkspaceId, { wsId: "ws" }),
        layerTraceEventsD1(client),
      );
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  ).finally(() => {
    db.close();
  });
};

test("TraceEvents -- an unknown run reads as an empty trace", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      assertEquals(yield* traces.get("ghost"), []);
    }),
  );
});

test("TraceEvents -- get orders by seq", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      for (const seq of [999999, 1000000, 8]) {
        yield* traces.append("run", {
          seq,
          at: seq,
          type: "node_start",
          nodeId: `n${seq}`,
        });
      }

      const trace = yield* traces.get("run");

      assertEquals(
        trace?.map((event) => event.seq),
        [8, 999999, 1000000],
      );
    }),
  );
});

test("TraceEvents -- traces are workspace-scoped", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const event: TraceEvent = {
        seq: 0,
        at: 1,
        type: "node_start",
        nodeId: "analyze",
      };

      yield* traces.append("run", event);

      const same = yield* traces.get("run");
      assertEquals(same?.length, 1);
      yield* Effect.provideService(
        Effect.gen(function* () {
          const tracesOther = yield* TraceEvents;
          // the other workspace has no rows: an empty trace, not an absent one
          assertEquals(yield* tracesOther.get("run"), []);
        }),
        WorkspaceId,
        { wsId: "other" },
      );
    }),
  );
});

test("TraceEvents -- an oversized event comes back whole", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const output = { text: "x".repeat(200_000) };
      const event: TraceEvent = {
        seq: 0,
        at: 1,
        type: "custom",
        nodeId: "analyze",
        event: { type: "output", output },
      };

      yield* traces.append("run", event);

      const [entry] = (yield* traces.get("run")) ?? [];
      if (entry?.type !== "custom" || entry.event.type !== "output") {
        throw new Error("expected a custom output event");
      }
      assertEquals(entry.event.output, output);
    }),
  );
});

test("TraceEvents -- escape-heavy content comes back whole", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const text = '\n"'.repeat(70_000);
      const event: TraceEvent = {
        seq: 0,
        at: 1,
        type: "custom",
        nodeId: "analyze",
        event: { type: "prompt", text },
      };

      yield* traces.append("run", event);

      const [entry] = (yield* traces.get("run")) ?? [];
      if (entry?.type !== "custom" || entry.event.type !== "prompt") {
        throw new Error("expected a custom prompt event");
      }
      assertEquals(entry.event.text, text);
    }),
  );
});

test("TraceEvents -- appending the same seq again replaces the event", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const mk = (nodeId: string): TraceEvent => ({
        seq: 4,
        at: 1,
        type: "node_start",
        nodeId,
      });

      yield* traces.append("run", mk("first"));
      yield* traces.append("run", mk("second"));

      const trace = yield* traces.get("run");
      assertEquals(trace?.length, 1);
      assertEquals(trace?.[0], mk("second"));
    }),
  );
});
