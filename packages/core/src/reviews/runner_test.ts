import { assertEquals } from "@std/assert";
import type { ResolvedReviewPass, ReviewUnit } from "@/config/types.ts";
import type { NodeRun } from "@/flow/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { runReviewPass } from "@/reviews/runner.ts";
import { ReviewStore } from "@/reviews/store.ts";
import { createSpyClient } from "@/reviews/testing/agent.ts";
import { type TraceEvent, TraceEventStore } from "@/reviews/trace/mod.ts";
import { createFile } from "@/vfs/testing/helpers.ts";

function unitFixture(
  partial: Partial<ReviewUnit> & Pick<ReviewUnit, "id">,
): ReviewUnit {
  return { promptKey: "dir", ...partial };
}

function passFixture(units: ReviewUnit[]): ResolvedReviewPass {
  return {
    pass: {
      id: "essay-review",
      name: "Essay review",
      systemPromptKey: "sys",
      modelPoolId: "pool",
      units,
    },
    units: units.map((unit) => ({
      id: unit.id,
      prompts: {
        system: "You are an editor.",
        directive: "Review the essay.",
        instructions: "",
        categories: "",
      },
      pool: { id: "pool", name: "Pool", models: ["m/a"] },
      inputs: unit.inputs ?? [],
      ...(unit.attempt && {
        attempt: {
          categories: [{ id: "grammar", label: "grammar" }],
          repairRounds: unit.attempt.repairRounds ?? 1,
        },
      }),
      ...(unit.summary && { summary: true }),
    })),
  };
}

function setup() {
  const adapter = new InMemoryAdapter();
  const reviewStore = new ReviewStore(adapter);
  const traceStore = new TraceEventStore(adapter);
  return { reviewStore, traceStore };
}

const ANALYSIS_ROUND =
  '{"thesis":"Drafts are raw material.","claims":[],"outline":[],"strengths":[],"risks":[]}';

/** Per-node event type sequences; cross-node order varies with the
 * scheduler, per-node order is fixed. Custom events carry the host
 * event's type. */
function byNode(trace: TraceEvent[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const event of trace) {
    const type = event.type === "custom" ? event.event.type : event.type;
    grouped[event.nodeId] = [...(grouped[event.nodeId] ?? []), type];
  }
  return grouped;
}

function nodeEnd(trace: TraceEvent[], nodeId: string): NodeRun | undefined {
  const event = trace.find(
    (candidate) => candidate.type === "node_end" && candidate.nodeId === nodeId,
  );
  return event?.type === "node_end" ? event.run : undefined;
}

function appliedEvents(trace: TraceEvent[]) {
  return trace.flatMap((event) =>
    event.type === "custom" && event.event.type === "applied"
      ? [event.event]
      : [],
  );
}

Deno.test("runReviewPass -- completes a pass with marks, summary, and a per-node trace", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello brave world");
  const { reviewStore, traceStore } = setup();
  const { agent, inputs } = createSpyClient([
    { text: ANALYSIS_ROUND, reasoning: "reading closely" },
    {
      text: '{"marks":[{"selected_text":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({
        id: "synthesize",
        summary: true,
        inputs: ["analyze", "mechanics.propose"],
      }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Solid draft.");

  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "brave");
  assertEquals(marks[0].meta, {
    runId: run.id,
    unitId: "mechanics",
  });

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    analyze: [
      "node_start",
      "prompt",
      "model_call",
      "reasoning",
      "output",
      "node_end",
    ],
    "mechanics.propose": [
      "node_start",
      "prompt",
      "model_call",
      "output",
      "node_end",
    ],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.collect": ["node_start", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": ["node_start", "node_end"],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
    synthesize: ["node_start", "prompt", "model_call", "output", "node_end"],
  });
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts.length, 1);
  assertEquals(applied[0].attempts[0].marked, true);
  assertEquals(applied[1].attempts.length, 0);
  assertEquals(inputs.length, 3);
  assertEquals(inputs[1].includes("Thesis: Drafts are raw material."), true);
});

Deno.test("runReviewPass -- a repair round re-quotes the failed spans", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const { reviewStore, traceStore } = setup();
  const { agent, inputs } = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    {
      text: '{"marks":[{"selected_text":"hello","comment":"found it","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Solid draft.");

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    "mechanics.propose": [
      "node_start",
      "prompt",
      "model_call",
      "output",
      "node_end",
    ],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.collect": ["node_start", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": [
      "node_start",
      "prompt",
      "model_call",
      "output",
      "node_end",
    ],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
    summary: ["node_start", "prompt", "model_call", "output", "node_end"],
  });
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts[0].marked, false);
  assertEquals(applied[1].attempts[0].marked, true);
  // The repair prompt quotes the failed span and its surroundings.
  assertEquals(inputs[1].includes('Attempted span: "ghost span"'), true);
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "hello");
});

Deno.test("runReviewPass -- a zero budget keeps failed marks with no repair nodes", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"], repairRounds: 0 },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(Object.keys(byNode(trace)), [
    "content",
    "mechanics.propose",
    "mechanics.apply",
    "mechanics.collect",
    "summary",
  ]);
  const applied = appliedEvents(trace);
  assertEquals(applied[0].attempts[0].marked, false);
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks, []);
});

Deno.test("runReviewPass -- a node error fails the run and skips dependents", async () => {
  const { vfs } = await createFile("essay.txt", "hello world");
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([{ text: "not json" }]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze"],
      }),
      unitFixture({
        id: "synthesize",
        summary: true,
        inputs: ["analyze"],
      }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error?.includes("not valid JSON"), true);

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  const grouped = byNode(trace);
  // The prompt is recorded before each call, the repair says why the first
  // reply was rejected, and the re-ask that also failed leaves two
  // model_call events with a repair between them.
  assertEquals(grouped.analyze, [
    "node_start",
    "prompt",
    "model_call",
    "repair",
    "prompt",
    "model_call",
    "repair",
    "node_end",
  ]);
  assertEquals(nodeEnd(trace, "analyze")?.status, "failed");
  for (const nodeId of [
    "mechanics.propose",
    "mechanics.apply",
    "mechanics.collect",
    "mechanics.repair1.gate",
    "mechanics.repair1.propose",
    "mechanics.repair1.apply",
    "synthesize",
  ]) {
    const skipped = nodeEnd(trace, nodeId);
    assertEquals(skipped?.status, "skipped");
    assertEquals(
      skipped?.status === "skipped"
        ? skipped.reason.includes('dependency "analyze" failed')
        : false,
      true,
    );
    assertEquals(grouped[nodeId], ["node_end"]);
  }
});

Deno.test("runReviewPass -- fails a pass that commits no summary", async () => {
  const { vfs } = await createFile("essay.txt", "hello world");
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([{ text: ANALYSIS_ROUND }]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    // No summary unit, so the graph commits no summary artifact. Reading it
    // back is a structural surprise, not a pass with a blank summary.
    pass: passFixture([unitFixture({ id: "analyze" })]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error?.includes('exactly one "summary"'), true);
  assertEquals(run.summary, undefined);
});

Deno.test("runReviewPass -- fails fast when the file does not exist", async () => {
  const vfs = (await createFile("other.txt", "x")).vfs;
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([unitFixture({ id: "analyze" })]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error, "File not found: essay.txt");
  assertEquals(await traceStore.get({ wsId: "ws", runId: run.id }), undefined);
});
