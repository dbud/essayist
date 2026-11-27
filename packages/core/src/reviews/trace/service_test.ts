import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { test } from "vitest";

import { reviewedFile, runInWorkspace } from "#/reviews/testing.ts";

import { TraceEvents } from "./service.ts";
import type { TraceEvent } from "./types.ts";

test("TraceEvents -- an unknown run reads as an empty trace", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      assertEquals(yield* traces.get("ghost"), []);
    }),
  );
});

test("TraceEvents -- get orders by seq", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const { run } = yield* reviewedFile();
      for (const seq of [999999, 1000000, 8]) {
        yield* traces.append(run.id, {
          seq,
          at: seq,
          type: "node_start",
          nodeId: `n${seq}`,
        });
      }

      const trace = yield* traces.get(run.id);

      assertEquals(
        trace?.map((event) => event.seq),
        [8, 999999, 1000000],
      );
    }),
  );
});

test("TraceEvents -- get reads the events past a seq", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const { run } = yield* reviewedFile();
      for (const seq of [1, 2, 3, 4]) {
        yield* traces.append(run.id, {
          seq,
          at: seq,
          type: "node_start",
          nodeId: `n${seq}`,
        });
      }

      const since2 = yield* traces.get(run.id, 2);
      assertEquals(
        since2.map((event) => event.seq),
        [3, 4],
      );

      const since4 = yield* traces.get(run.id, 4);
      assertEquals(since4, []);

      assertEquals(yield* traces.get("ghost", 0), []);
    }),
  );
});

test("TraceEvents -- traces are workspace-scoped", async () => {
  await runInWorkspace((other) =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const { run } = yield* reviewedFile();
      const event: TraceEvent = {
        seq: 0,
        at: 1,
        type: "node_start",
        nodeId: "analyze",
      };

      yield* traces.append(run.id, event);

      const same = yield* traces.get(run.id);
      assertEquals(same?.length, 1);
      // another workspace reads an empty trace, not an absent one
      assertEquals(yield* other(traces.get(run.id)), []);
    }),
  );
});

test("TraceEvents -- an oversized event comes back whole", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const { run } = yield* reviewedFile();
      const output = { text: "x".repeat(200_000) };
      const event: TraceEvent = {
        seq: 0,
        at: 1,
        type: "custom",
        nodeId: "analyze",
        event: { type: "output", output },
      };

      yield* traces.append(run.id, event);

      const [entry] = (yield* traces.get(run.id)) ?? [];
      if (entry?.type !== "custom" || entry.event.type !== "output") {
        throw new Error("expected a custom output event");
      }
      assertEquals(entry.event.output, output);
    }),
  );
});

test("TraceEvents -- escape-heavy content comes back whole", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const { run } = yield* reviewedFile();
      const text = '\n"'.repeat(70_000);
      const event: TraceEvent = {
        seq: 0,
        at: 1,
        type: "custom",
        nodeId: "analyze",
        event: { type: "prompt", text },
      };

      yield* traces.append(run.id, event);

      const [entry] = (yield* traces.get(run.id)) ?? [];
      if (entry?.type !== "custom" || entry.event.type !== "prompt") {
        throw new Error("expected a custom prompt event");
      }
      assertEquals(entry.event.text, text);
    }),
  );
});

test("TraceEvents -- appending the same seq again replaces the event", async () => {
  await runInWorkspace(() =>
    Effect.gen(function* () {
      const traces = yield* TraceEvents;
      const { run } = yield* reviewedFile();
      const mk = (nodeId: string): TraceEvent => ({
        seq: 4,
        at: 1,
        type: "node_start",
        nodeId,
      });

      yield* traces.append(run.id, mk("first"));
      yield* traces.append(run.id, mk("second"));

      const trace = yield* traces.get(run.id);
      assertEquals(trace?.length, 1);
      assertEquals(trace?.[0], mk("second"));
    }),
  );
});
