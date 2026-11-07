/**
 * The service over both transports: kv-shaped chunked rows and the D1 event table. Chunk reassembly
 * applies only to the kv transport.
 */

import { DatabaseSync } from "node:sqlite";

import * as D1Client from "@effect/sql-d1/D1Client";
import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { test } from "vitest";

import { ChunkedValues, type MissingChunksError } from "#/persistence/chunked_values.ts";
import { d1SqliteShim } from "#/persistence/kv_d1_sqlite.ts";
import type { ConcurrentModificationError, PersistenceError } from "#/persistence/mod.ts";
import { testLayer } from "#/persistence/testing/kv.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

import { TraceEvents } from "./service.ts";
import { layerTraceEventsD1 } from "./trace_d1.ts";
import type { TraceEvent } from "./types.ts";

type E = PersistenceError | ConcurrentModificationError | MissingChunksError;

/** Same service over the kv-compat table and over the review_trace_events D1 table. */
interface Backend {
  name: string;
  run: <A>(program: Effect.Effect<A, E, TraceEvents | WorkspaceId>) => Promise<A>;
}

const kvBackend: Backend = {
  name: "kv",
  run: <A>(program: Effect.Effect<A, E, TraceEvents | WorkspaceId>): Promise<A> =>
    Effect.runPromise(
      Effect.provide(
        Effect.provideService(program, WorkspaceId, { wsId: "ws" }),
        testLayer(
          Layer.merge(
            Layer.provide(TraceEvents.layerNoDeps, ChunkedValues.layerNoDeps),
            ChunkedValues.layerNoDeps,
          ),
        ),
      ),
    ),
};

const d1Backend: Backend = {
  name: "d1",
  run: async <A>(program: Effect.Effect<A, E, TraceEvents | WorkspaceId>): Promise<A> => {
    const db = new DatabaseSync(":memory:");
    try {
      return await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* D1Client.make({ db: d1SqliteShim(db) });
          return yield* Effect.provide(
            Effect.provideService(program, WorkspaceId, { wsId: "ws" }),
            layerTraceEventsD1(client),
          );
        }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
      );
    } finally {
      db.close();
    }
  },
};

for (const backend of [kvBackend, d1Backend]) {
  const run = <A>(program: Effect.Effect<A, E, TraceEvents | WorkspaceId>): Promise<A> =>
    backend.run(program);

  test(`TraceEvents (${backend.name}) -- get returns undefined for an unknown run`, async () => {
    await run(
      Effect.gen(function* () {
        const traces = yield* TraceEvents;
        assertEquals(yield* traces.get("ghost"), undefined);
      }),
    );
  });

  test(`TraceEvents (${backend.name}) -- get orders by seq, not by key`, async () => {
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

  test(`TraceEvents (${backend.name}) -- traces are workspace-scoped`, async () => {
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
            assertEquals(yield* tracesOther.get("run"), undefined);
          }),
          WorkspaceId,
          { wsId: "other" },
        );
      }),
    );
  });

  test(`TraceEvents (${backend.name}) -- an oversized event comes back whole`, async () => {
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

  test(`TraceEvents (${backend.name}) -- escape-heavy content comes back whole`, async () => {
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

  test(`TraceEvents (${backend.name}) -- appending the same seq again replaces the event`, async () => {
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

  if (backend.name === "kv") {
    // a D1 row caps at its own per-row size limit, so a multi-chunk event is a kv-only concern
    test(`TraceEvents (${backend.name}) -- a value spanning many chunks reassembles`, async () => {
      await run(
        Effect.gen(function* () {
          const traces = yield* TraceEvents;
          const text = "y".repeat(2_000_000);
          const event: TraceEvent = {
            seq: 0,
            at: 1,
            type: "custom",
            nodeId: "analyze",
            event: { type: "reasoning", text },
          };

          yield* traces.append("run", event);

          const [entry] = (yield* traces.get("run")) ?? [];
          if (entry?.type !== "custom" || entry.event.type !== "reasoning") {
            throw new Error("expected a custom reasoning event");
          }
          assertEquals(entry.event.text.length, text.length);
          assertEquals(entry.event.text === text, true);
        }),
      );
    });
  }
}
