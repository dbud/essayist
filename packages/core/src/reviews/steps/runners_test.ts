import { assertEquals } from "@std/assert";
import { FlowRunner } from "@/flow/runner.ts";
import type {
  Artifact,
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
        kind: "propose",
        dependsOn: ["content", "structure"],
        payload: CALL,
      },
      {
        id: "mechanics.apply",
        kind: "apply",
        dependsOn: ["mechanics.propose"],
        payload: {
          allowedLabels: ["grammar"],
          provenance: { runId: "r", stepId: "mechanics" },
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
    ["content", "analysis", "proposals", "placed", "summary"],
  );
  assertEquals(result.artifacts[1].producedBy, "structure");
  const placed = artifactsOf(result, "placed").flat();
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
  assertEquals(marks[0].meta, { runId: "r", stepId: "mechanics" });
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
  const provenance = { runId: "r", stepId: "m" };
  const flow = new FlowRunner<ReviewTypes>({ runners });

  const result = await flow.run({
    nodes: [
      { id: "content", kind: "source", dependsOn: [] },
      {
        id: "m.propose",
        kind: "propose",
        dependsOn: ["content"],
        payload: CALL,
      },
      {
        id: "m.apply",
        kind: "apply",
        dependsOn: ["m.propose"],
        payload: { allowedLabels: ["grammar"], provenance },
      },
      {
        id: "m.repairGate",
        kind: "gate",
        dependsOn: ["m.apply"],
        payload: {
          when: (inputs) => inputs.of("failed").length > 0,
          types: ["failed"],
        },
      },
      {
        id: "m.repairPropose",
        kind: "repairPropose",
        dependsOn: ["content", "m.repairGate"],
        payload: CALL,
      },
      {
        id: "m.repairApply",
        kind: "apply",
        dependsOn: ["m.repairPropose"],
        payload: { allowedLabels: ["grammar"], provenance },
      },
    ],
  } as FlowGraph<ReviewTypes>);

  assertEquals(result.status, "completed");
  assertEquals(
    result.artifacts.map((artifact) => [artifact.type, artifact.producedBy]),
    [
      ["content", "content"],
      ["proposals", "m.propose"],
      ["placed", "m.apply"],
      ["failed", "m.apply"],
      // The gate re-emits the failed artifact unchanged; provenance stays
      // with m.apply.
      ["failed", "m.apply"],
      ["proposals", "m.repairPropose"],
      ["placed", "m.repairApply"],
    ],
  );
  const placed = artifactsOf(result, "placed");
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
