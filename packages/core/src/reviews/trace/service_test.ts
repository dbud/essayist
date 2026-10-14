import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import { test } from "vitest";
import {
  ChunkedValues,
  type MissingChunksError,
} from "@/persistence/chunked_values.ts";
import type {
  ConcurrentModificationError,
  PersistenceError,
} from "@/persistence/mod.ts";
import { testLayer } from "@/persistence/testing/kv.ts";
import { WorkspaceId } from "@/workspace/WorkspaceId.ts";
import { TraceEvents } from "./service.ts";
import type { TraceEvent } from "./types.ts";

type E = PersistenceError | ConcurrentModificationError | MissingChunksError;

const run = <A>(
  program: Effect.Effect<A, E, TraceEvents | WorkspaceId>,
): Promise<A> =>
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
  );

test("TraceEvents -- get returns undefined for an unknown run", async () => {
  await run(
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      assertEquals(yield* traces.get("ghost"), undefined);
    }),
  );
});

test("TraceEvents -- get orders by seq, not by key", async () => {
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
          assertEquals(yield* tracesOther.get("run"), undefined);
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
  // Newlines and quotes expand when serialized, so a chunk budget taken on
  // raw bytes would be too generous.
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

test("TraceEvents -- a value spanning many chunks reassembles", async () => {
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
