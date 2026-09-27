import { assertEquals } from "@std/assert";
import type { PassWhenSpec } from "@/flow/helpers.ts";
import { FlowRunner } from "@/flow/runner.ts";
import type {
  Artifact,
  Artifacts,
  FlowEvent,
  FlowGraph,
  FlowRunResult,
} from "@/flow/types.ts";
import {
  createReviewRunners,
  type ReviewNodeEvent,
  type ReviewTypes,
} from "@/reviews/graph.ts";
import { createSpyClient } from "@/reviews/testing/agent.ts";
import { PinnedVFS } from "@/vfs/pin.ts";
import { createFile } from "@/vfs/testing/helpers.ts";

const ANALYSIS_ROUND =
  '{"thesis":"Drafts are raw material.","claims":[],"outline":[],"strengths":[],"risks":[]}';

const CALL = {
  system: "You are an editor.",
  directive: "Mark mechanics.",
  instructions: "",
  models: ["m/a"],
};

const GATE_PAYLOAD: PassWhenSpec<ReviewTypes> = {
  when: (inputs: Artifacts<ReviewTypes>) => inputs.of("mark.failed").length > 0,
  types: ["mark.failed"],
};

function customs(events: FlowEvent[]): [string, string][] {
  return events
    .filter(
      (event): event is Extract<FlowEvent, { type: "custom" }> =>
        event.type === "custom",
    )
    .map((event) => [event.nodeId, (event.event as ReviewNodeEvent).type]);
}

function artifactsOf<A extends keyof ReviewTypes["artifacts"]>(
  result: FlowRunResult<ReviewTypes>,
  type: A,
): ReviewTypes["artifacts"][A][] {
  return result.artifacts
    .filter(
      (artifact): artifact is Artifact<ReviewTypes, A> =>
        artifact.type === type,
    )
    .map((artifact) => artifact.data);
}

Deno.test("review runners -- analyze, propose, apply, and synthesize in a flow", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello brave world");
  const pinned = new PinnedVFS(vfs, { path: "essay.txt", versionId });
  const { agent, inputs } = createSpyClient([
    { text: ANALYSIS_ROUND, reasoning: "reading closely" },
    {
      text: '{"marks":[{"selected_text":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const runners = createReviewRunners({ agent, pinned });
  const events: FlowEvent[] = [];
  const flow = new FlowRunner<ReviewTypes>({
    runners,
    onEvent: (event) => {
      events.push(event);
    },
  });

  const graph: FlowGraph<ReviewTypes> = {
    nodes: [
      { id: "content", kind: "source", dependsOn: [] },
      {
        id: "structure",
        kind: "analyze",
        dependsOn: ["content"],
        payload: {
          system: "You are an editor.",
          directive: "Analyze the draft.",
          instructions: "",
          models: ["m/a"],
        },
      },
      {
        id: "mechanics.propose",
        kind: "mark.propose",
        dependsOn: ["content", "structure"],
        payload: CALL,
      },
      {
        id: "mechanics.apply",
        kind: "mark.apply",
        dependsOn: ["mechanics.propose"],
        payload: {
          allowedLabels: ["grammar"],
          provenance: { runId: "r", unitId: "mechanics" },
        },
      },
      {
        id: "summary",
        kind: "synthesize",
        dependsOn: ["content", "mechanics.apply"],
        payload: {
          system: "You are an editor.",
          directive: "Summarize.",
          instructions: "",
          models: ["m/a"],
        },
      },
    ],
  };

  const result = await flow.run(graph);

  assertEquals(result.errors, []);
  assertEquals(result.status, "completed");
  assertEquals(
    result.artifacts.map((artifact) => artifact.type),
    ["content", "analysis", "mark.proposals", "mark.placed", "summary"],
  );
  assertEquals(result.artifacts[1].producedBy, "structure");
  const placed = artifactsOf(result, "mark.placed").flat();
  assertEquals(
    placed.map((attempt) => [attempt.selected_text, attempt.marked]),
    [["brave", true]],
  );
  assertEquals(artifactsOf(result, "summary")[0], "Solid draft.");
  // The propose prompt carries the referenced analysis content.
  assertEquals(inputs[1].includes("Thesis: Drafts are raw material."), true);
  assertEquals(customs(events), [
    ["structure", "prompt"],
    ["structure", "reasoning"],
    ["structure", "output"],
    ["structure", "usage"],
    ["mechanics.propose", "prompt"],
    ["mechanics.propose", "output"],
    ["mechanics.propose", "usage"],
    ["mechanics.apply", "applied"],
    ["summary", "prompt"],
    ["summary", "output"],
    ["summary", "usage"],
  ]);

  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].meta, { runId: "r", unitId: "mechanics" });
});

Deno.test("review runners -- repair propose stays idle without failures", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const pinned = new PinnedVFS(vfs, { path: "essay.txt", versionId });
  const { agent, inputs } = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"hello","comment":"found it","label":"grammar"}]}',
    },
  ]);
  const runners = createReviewRunners({ agent, pinned });
  const provenance = { runId: "r", unitId: "m" };
  const flow = new FlowRunner<ReviewTypes>({ runners });

  const result = await flow.run({
    nodes: [
      { id: "content", kind: "source", dependsOn: [] },
      {
        id: "m.propose",
        kind: "mark.propose",
        dependsOn: ["content"],
        payload: CALL,
      },
      {
        id: "m.apply",
        kind: "mark.apply",
        dependsOn: ["m.propose"],
        payload: { allowedLabels: ["grammar"], provenance },
      },
      {
        id: "m.repair1.gate",
        kind: "mark.repair.gate",
        dependsOn: ["m.apply"],
        payload: GATE_PAYLOAD,
      },
      {
        id: "m.repair1.propose",
        kind: "mark.propose.repair",
        dependsOn: ["content", "m.repair1.gate"],
        payload: CALL,
      },
      {
        id: "m.repair1.apply",
        kind: "mark.apply",
        dependsOn: ["m.repair1.propose"],
        payload: { allowedLabels: ["grammar"], provenance },
      },
    ],
  } as FlowGraph<ReviewTypes>);

  assertEquals(result.status, "completed");
  // The gate forwarded nothing, so the repair propose never called the
  // model and produced no proposals.
  assertEquals(inputs.length, 1);
  assertEquals(
    result.nodeRuns.find((run) => run.nodeId === "m.repair1.propose")?.status,
    "completed",
  );
  const proposals = result.artifacts.filter(
    (artifact) => artifact.type === "mark.proposals",
  );
  assertEquals(proposals.length, 1);
  assertEquals(proposals[0].producedBy, "m.propose");
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(
    marks.map((mark) => mark.selected_text),
    ["hello"],
  );
});

Deno.test("review runners -- a repair round re-quotes failed spans", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const pinned = new PinnedVFS(vfs, { path: "essay.txt", versionId });
  const { agent, inputs } = createSpyClient([
    {
      text: '{"marks":[{"selected_text":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    {
      text: '{"marks":[{"selected_text":"hello","comment":"found it","label":"grammar"}]}',
    },
  ]);
  const runners = createReviewRunners({ agent, pinned });
  const provenance = { runId: "r", unitId: "m" };
  const flow = new FlowRunner<ReviewTypes>({ runners });

  const result = await flow.run({
    nodes: [
      { id: "content", kind: "source", dependsOn: [] },
      {
        id: "m.propose",
        kind: "mark.propose",
        dependsOn: ["content"],
        payload: CALL,
      },
      {
        id: "m.apply",
        kind: "mark.apply",
        dependsOn: ["m.propose"],
        payload: { allowedLabels: ["grammar"], provenance },
      },
      {
        id: "m.repair1.gate",
        kind: "mark.repair.gate",
        dependsOn: ["m.apply"],
        payload: GATE_PAYLOAD,
      },
      {
        id: "m.repair1.propose",
        kind: "mark.propose.repair",
        dependsOn: ["content", "m.repair1.gate"],
        payload: CALL,
      },
      {
        id: "m.repair1.apply",
        kind: "mark.apply",
        dependsOn: ["m.repair1.propose"],
        payload: { allowedLabels: ["grammar"], provenance },
      },
    ],
  } as FlowGraph<ReviewTypes>);

  assertEquals(result.status, "completed");
  assertEquals(
    result.artifacts.map((artifact) => [artifact.type, artifact.producedBy]),
    [
      ["content", "content"],
      ["mark.proposals", "m.propose"],
      ["mark.placed", "m.apply"],
      ["mark.failed", "m.apply"],
      // The gate re-emits the failed artifact unchanged; provenance stays
      // with m.apply.
      ["mark.failed", "m.apply"],
      ["mark.proposals", "m.repair1.propose"],
      ["mark.placed", "m.repair1.apply"],
    ],
  );
  const placed = artifactsOf(result, "mark.placed");
  assertEquals(placed[0], []);
  assertEquals(placed[1].length, 1);
  assertEquals(placed[1][0].marked, true);
  assertEquals(inputs[1].includes('Attempted span: "ghost span"'), true);

  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(
    marks.map((mark) => mark.selected_text),
    ["hello"],
  );
});
