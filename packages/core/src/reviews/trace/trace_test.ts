import { assertEquals } from "@std/assert";
import type { FlowEvent } from "@/flow/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import { byteLength } from "@/utils/truncate.ts";
import { MAX_ENTRY_BYTES } from "./recorder.ts";
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

Deno.test("TraceRecorder -- outputs that fit stay structured", async () => {
  const output = { text: "x".repeat(55_000) };
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "output", output },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "output") return;
  assertEquals(entry.event.truncated, undefined);
  assertEquals(entry.event.output, output);
});

Deno.test("TraceRecorder -- oversized outputs are truncated to a JSON prefix", async () => {
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "output", output: { text: "x".repeat(70_000) } },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "output") return;
  assertEquals(entry.event.truncated, true);
  const capped = entry.event.output as string;
  assertEquals(capped.startsWith('{"text":"'), true);
  assertEquals(byteLength(JSON.stringify(entry)) <= MAX_ENTRY_BYTES, true);
});

Deno.test("TraceRecorder -- escape-heavy outputs stay under the cap", async () => {
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      // Newlines and quotes double under JSON escaping, so a raw
      // budget of the full text would still overflow once serialized.
      event: { type: "output", output: { text: '\n"'.repeat(35_000) } },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "output") return;
  assertEquals(entry.event.truncated, true);
  assertEquals(byteLength(JSON.stringify(entry)) <= MAX_ENTRY_BYTES, true);
});

Deno.test("TraceRecorder -- escape-heavy prompts stay under the cap", async () => {
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "prompt", text: '\n"'.repeat(35_000) },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "prompt") return;
  assertEquals(entry.event.truncated, true);
  assertEquals(byteLength(JSON.stringify(entry)) <= MAX_ENTRY_BYTES, true);
});

Deno.test("TraceRecorder -- oversized prompts keep their head", async () => {
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      event: { type: "prompt", text: `directive\n${"x".repeat(70_000)}` },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "prompt") return;
  assertEquals(entry.event.truncated, true);
  assertEquals(entry.event.text.startsWith("directive\n"), true);
  assertEquals(byteLength(JSON.stringify(entry)) <= MAX_ENTRY_BYTES, true);
});

Deno.test("TraceRecorder -- oversized reasoning keeps its tail", async () => {
  const { trace } = await recorded([
    {
      type: "custom",
      nodeId: "analyze",
      event: {
        type: "reasoning",
        text: `${"x".repeat(70_000)}\nfinal judgement`,
      },
    },
  ]);
  const [entry] = trace ?? [];
  if (entry?.type !== "custom" || entry.event.type !== "reasoning") return;
  assertEquals(entry.event.truncated, true);
  assertEquals(entry.event.text.endsWith("\nfinal judgement"), true);
  assertEquals(byteLength(JSON.stringify(entry)) <= MAX_ENTRY_BYTES, true);
});

Deno.test("TraceEventStore -- get returns undefined for an unknown run", async () => {
  const traceStore = store();
  assertEquals(await traceStore.get({ wsId: "ws", runId: "ghost" }), undefined);
});
