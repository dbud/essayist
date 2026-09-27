import { assertEquals } from "@std/assert";
import type { ResolvedReviewPass, Step } from "@/config/types.ts";
import type { NodeRun } from "@/flow/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { runReviewPass } from "@/reviews/runner.ts";
import { ReviewStore } from "@/reviews/store.ts";
import { createSpyClient } from "@/reviews/testing/agent.ts";
import { EventTraceStore, type TracedReviewEvent } from "@/reviews/trace.ts";
import { createFile } from "@/vfs/testing/helpers.ts";

function stepFixture(partial: Partial<Step> & Pick<Step, "id" | "kind">): Step {
  return {
    name: partial.id,
    systemPromptKey: "sys",
    directivePromptKey: "dir",
    ...partial,
  };
}

function passFixture(steps: Step[]): ResolvedReviewPass {
  return {
    pass: {
      id: "essay-review",
      name: "Essay review",
      modelPoolId: "pool",
      steps,
    },
    steps: steps.map((step) => ({
      step,
      modelRefs: ["m/a"],
      apiKeyEnvKey: "KEY",
      systemPrompt: "You are an editor.",
      directive: `Review the essay.`,
      instructions: "",
      categories: [],
      allowedLabels: step.kind === "mark" ? ["grammar"] : [],
    })),
  };
}

function setup() {
  const adapter = new InMemoryAdapter();
  const reviewStore = new ReviewStore(adapter);
  const traceStore = new EventTraceStore(adapter);
  return { reviewStore, traceStore };
}

const ANALYSIS_ROUND =
  '{"thesis":"Drafts are raw material.","claims":[],"outline":[],"strengths":[],"risks":[]}';

/** Per-node event type sequences; cross-node order varies with the
 * scheduler, per-node order is fixed. Custom events carry the host
 * event's type. */
function byNode(trace: TracedReviewEvent[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const event of trace) {
    const type = event.type === "custom" ? event.event.type : event.type;
    grouped[event.nodeId] = [...(grouped[event.nodeId] ?? []), type];
  }
  return grouped;
}

function nodeEnd(
  trace: TracedReviewEvent[],
  nodeId: string,
): NodeRun | undefined {
  const event = trace.find(
    (candidate) => candidate.type === "node_end" && candidate.nodeId === nodeId,
  );
  return event?.type === "node_end" ? event.run : undefined;
}

function appliedEvents(trace: TracedReviewEvent[]) {
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
      stepFixture({ id: "analyze", name: "Analyze", kind: "analyze" }),
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        artifactsFromStepIds: ["analyze"],
      }),
      stepFixture({
        id: "synthesize",
        name: "Synthesize",
        kind: "synthesize",
        artifactsFromStepIds: ["analyze", "mechanics.propose"],
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
      "reasoning",
      "output",
      "usage",
      "node_end",
    ],
    "mechanics.propose": [
      "node_start",
      "prompt",
      "output",
      "usage",
      "node_end",
    ],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": ["node_start", "node_end"],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
    synthesize: ["node_start", "prompt", "output", "usage", "node_end"],
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
  ]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      stepFixture({ id: "mechanics", name: "Mechanics", kind: "mark" }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "");

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(byNode(trace), {
    content: ["node_start", "node_end"],
    "mechanics.propose": [
      "node_start",
      "prompt",
      "output",
      "usage",
      "node_end",
    ],
    "mechanics.apply": ["node_start", "applied", "node_end"],
    "mechanics.repair1.gate": ["node_start", "node_end"],
    "mechanics.repair1.propose": [
      "node_start",
      "prompt",
      "output",
      "usage",
      "node_end",
    ],
    "mechanics.repair1.apply": ["node_start", "applied", "node_end"],
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
  ]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        repairRounds: 0,
      }),
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
      stepFixture({ id: "analyze", name: "Analyze", kind: "analyze" }),
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        artifactsFromStepIds: ["analyze"],
      }),
      stepFixture({
        id: "synthesize",
        name: "Synthesize",
        kind: "synthesize",
        artifactsFromStepIds: ["analyze"],
      }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error?.includes("not valid JSON"), true);

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  const grouped = byNode(trace);
  // The prompt is recorded before the failing call.
  assertEquals(grouped.analyze, ["node_start", "prompt", "node_end"]);
  assertEquals(nodeEnd(trace, "analyze")?.status, "failed");
  for (const nodeId of [
    "mechanics.propose",
    "mechanics.apply",
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

Deno.test("runReviewPass -- fails fast when the file does not exist", async () => {
  const vfs = (await createFile("other.txt", "x")).vfs;
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([]);

  const run = await runReviewPass({
    agent,
    vfs,
    reviewStore,
    traceStore,
    pass: passFixture([
      stepFixture({ id: "analyze", name: "Analyze", kind: "analyze" }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error, "File not found: essay.txt");
  assertEquals(await traceStore.get({ wsId: "ws", runId: run.id }), undefined);
});
