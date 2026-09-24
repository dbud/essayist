import { assertEquals } from "@std/assert";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { EventTraceStore } from "./trace.ts";
import type { ReviewTraceEvent, TracedReviewEvent } from "./types.ts";

function store() {
  return new EventTraceStore(new InMemoryAdapter());
}

async function recorded(events: ReviewTraceEvent[]): Promise<{
  trace: TracedReviewEvent[] | undefined;
  derived: TracedReviewEvent[];
}> {
  const traceStore = store();
  const derived: TracedReviewEvent[] = [];
  const recorder = traceStore.recorder({ wsId: "ws", runId: "run" }, (event) =>
    derived.push(event),
  );
  for (const event of events) recorder.record(event);
  await recorder.flush();

  return { trace: await traceStore.get({ wsId: "ws", runId: "run" }), derived };
}

Deno.test("TraceRecorder -- persists events with ordered seq and timestamps", async () => {
  const { trace, derived } = await recorded([
    {
      type: "step_start",
      stepId: "analyze",
      stepName: "Analyze",
      kind: "analyze",
    },
    { type: "step_input", stepId: "analyze", text: "read the essay" },
    { type: "step_end", stepId: "analyze" },
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
    ["step_start", "step_input", "step_end"],
  );
  assertEquals(derived, trace);
});

Deno.test("TraceRecorder -- record after flush is ignored", async () => {
  const traceStore = store();
  const recorder = traceStore.recorder({ wsId: "ws", runId: "run" });
  recorder.record({ type: "step_error", error: "boom" });
  await recorder.flush();
  recorder.record({ type: "step_error", error: "after flush" });

  const trace = await traceStore.get({ wsId: "ws", runId: "run" });
  assertEquals(trace?.length, 1);
  const first = trace?.[0];
  assertEquals(first?.type, "step_error");
  assertEquals(first?.type === "step_error" ? first.error : undefined, "boom");
});

Deno.test("TraceRecorder -- flush is idempotent", async () => {
  const traceStore = store();
  const recorder = traceStore.recorder({ wsId: "ws", runId: "run" });
  recorder.record({ type: "step_error", error: "boom" });
  await recorder.flush();
  await recorder.flush();

  const trace = await traceStore.get({ wsId: "ws", runId: "run" });
  assertEquals(trace?.length, 1);
});

Deno.test("TraceRecorder -- oversized step outputs are truncated", async () => {
  const { trace } = await recorded([
    {
      type: "step_output",
      stepId: "analyze",
      output: { text: "x".repeat(15_000) },
    },
    {
      type: "step_output",
      stepId: "analyze",
      output: { text: "x".repeat(17_000) },
    },
  ]);

  assertEquals(trace?.length, 2);
  const [small, oversized] = trace ?? [];
  assertEquals(small?.type, "step_output");
  assertEquals(
    small?.type === "step_output" ? small.truncated : undefined,
    undefined,
  );
  assertEquals(oversized?.type, "step_output");
  if (oversized?.type !== "step_output") return;
  assertEquals(oversized.truncated, true);
  const capped = oversized.output as string;
  assertEquals(capped.length, 16_000);
});

Deno.test("EventTraceStore -- get returns undefined for an unknown run", async () => {
  const traceStore = store();
  assertEquals(await traceStore.get({ wsId: "ws", runId: "ghost" }), undefined);
});
