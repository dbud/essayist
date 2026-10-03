import { assertEquals } from "@std/assert";
import type { FlowEvent } from "@/flow/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { TraceEventStore } from "./store.ts";
import type { TraceEvent } from "./types.ts";

function store() {
  return new TraceEventStore(new InMemoryAdapter());
}

async function recorded(events: FlowEvent<ReviewTypes>[]): Promise<{
  trace: TraceEvent[] | undefined;
  derived: TraceEvent[];
}> {
  const traceStore = store();
  const derived: TraceEvent[] = [];
  const recorder = traceStore.recorder({ wsId: "ws", runId: "run" }, (event) =>
    derived.push(event),
  );
  for (const event of events) recorder.record(event);
  await recorder.flush();

  return { trace: await traceStore.get({ wsId: "ws", runId: "run" }), derived };
}

Deno.test("TraceRecorder -- persists events with ordered seq and timestamps", async () => {
  const { trace, derived } = await recorded([
    { type: "node_start", nodeId: "analyze" },
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "prompt", text: "read the essay" },
    },
    {
      type: "node_end",
      nodeId: "analyze",
      run: {
        nodeId: "analyze",
        status: "completed",
        startedAt: 1,
        completedAt: 2,
        artifacts: [],
      },
    },
  ]);

  assertEquals(derived.length, 3);
  assertEquals(
    trace?.map((e) => e.seq),
    [0, 1, 2],
  );
  assertEquals(
    trace?.every((e) => e.at > 0),
    true,
  );
  assertEquals(
    trace?.map((e) => e.type),
    ["node_start", "custom", "node_end"],
  );
  assertEquals(derived, trace);
});

Deno.test("TraceRecorder -- record after flush is ignored", async () => {
  const traceStore = store();
  const recorder = traceStore.recorder({ wsId: "ws", runId: "run" });
  recorder.record({
    type: "custom",
    nodeId: "n",
    event: { type: "prompt", text: "boom" },
  });
  await recorder.flush();
  recorder.record({
    type: "custom",
    nodeId: "n",
    event: { type: "prompt", text: "after flush" },
  });

  const trace = await traceStore.get({ wsId: "ws", runId: "run" });
  assertEquals(trace?.length, 1);
  const first = trace?.[0];
  assertEquals(
    first?.type === "custom" && first.event.type === "prompt"
      ? first.event.text
      : undefined,
    "boom",
  );
});

Deno.test("TraceRecorder -- flush is idempotent", async () => {
  const traceStore = store();
  const recorder = traceStore.recorder({ wsId: "ws", runId: "run" });
  recorder.record({
    type: "custom",
    nodeId: "n",
    event: { type: "prompt", text: "boom" },
  });
  await recorder.flush();
  await recorder.flush();

  const trace = await traceStore.get({ wsId: "ws", runId: "run" });
  assertEquals(trace?.length, 1);
});

Deno.test("TraceRecorder -- an oversized output comes back whole", async () => {
  const output = { text: "x".repeat(200_000) };
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "output", output },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "output") return;
  assertEquals(entry.event.output, output);
});

Deno.test("TraceRecorder -- an oversized prompt comes back whole", async () => {
  const text = `directive\n${"x".repeat(200_000)}`;
  const { trace } = await recorded([
    { type: "custom", nodeId: "analyze", event: { type: "prompt", text } },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "prompt") return;
  assertEquals(entry.event.text, text);
});

Deno.test("TraceRecorder -- oversized reasoning comes back whole", async () => {
  const text = `${"x".repeat(200_000)}\nfinal judgement`;
  const { trace } = await recorded([
    { type: "custom", nodeId: "analyze", event: { type: "reasoning", text } },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "reasoning") return;
  assertEquals(entry.event.text, text);
});

Deno.test("TraceRecorder -- escape-heavy content comes back whole", async () => {
  // Newlines and quotes expand when serialized, so a chunk budget taken on
  // raw bytes would be too generous.
  const text = '\n"'.repeat(70_000);
  const { trace } = await recorded([
    { type: "custom", nodeId: "analyze", event: { type: "prompt", text } },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "prompt") return;
  assertEquals(entry.event.text, text);
});

Deno.test("TraceRecorder -- a value spanning many chunks reassembles", async () => {
  const text = "y".repeat(2_000_000);
  const { trace } = await recorded([
    { type: "custom", nodeId: "analyze", event: { type: "reasoning", text } },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "reasoning") return;
  assertEquals(entry.event.text.length, text.length);
  assertEquals(entry.event.text === text, true);
});

Deno.test("TraceEventStore -- get returns undefined for an unknown run", async () => {
  const traceStore = store();
  assertEquals(await traceStore.get({ wsId: "ws", runId: "ghost" }), undefined);
});

Deno.test("TraceEventStore -- get orders by seq, not by key", async () => {
  const traceStore = store();
  for (const seq of [999999, 1000000, 8]) {
    await traceStore.append({
      wsId: "ws",
      runId: "run",
      event: { seq, at: seq, type: "node_start", nodeId: `n${seq}` },
    });
  }

  const trace = await traceStore.get({ wsId: "ws", runId: "run" });

  assertEquals(
    trace?.map((event) => event.seq),
    [8, 999999, 1000000],
  );
});
