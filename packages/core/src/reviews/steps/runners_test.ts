import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import { test } from "vitest";

import type { ResolvedReviewUnit } from "#/config/types.ts";
import type { PassWhenSpec } from "#/flow/helpers.ts";
import { FlowRunner } from "#/flow/runner.ts";
import type { Artifacts, FlowEvent, FlowGraph, FlowRunResult } from "#/flow/types.ts";
import { Marks } from "#/marks/d1/service.ts";
import { createFakeClient } from "#/model/fake_client.ts";
import { ModelClient } from "#/model/service.ts";
import {
  type ReviewNodeEvent,
  type ReviewServices,
  type ReviewTypes,
  reviewRunners,
} from "#/reviews/graph.ts";
import type { MarkContext } from "#/reviews/steps/mark.ts";
import { openReviewDatabase, type ReviewTestServices, reviewedFile } from "#/reviews/testing.ts";
import { WorkspaceId } from "#/workspace/WorkspaceId.ts";

const ANALYSIS_ROUND =
  '{"thesis":"Drafts are raw material.","claims":[],"outline":[],"strengths":[],"risks":[]}';

function unitPayload(id: string, directive: string): ResolvedReviewUnit {
  return {
    id,
    prompts: {
      system: "You are an editor.",
      directive,
      instructions: "",
      categories: "",
    },
    pool: { id: "pool", name: "Pool", models: ["m/a"] },
    inputs: [],
  };
}

const GATE_PAYLOAD: PassWhenSpec<ReviewTypes> = {
  when: (inputs: Artifacts<ReviewTypes>) => inputs.of("mark.failed").length > 0,
  types: ["mark.failed"],
};

function customs(events: FlowEvent[]): [string, string][] {
  return events
    .filter((event): event is Extract<FlowEvent, { type: "custom" }> => event.type === "custom")
    .map((event) => [event.nodeId, (event.event as ReviewNodeEvent).type]);
}

function artifactsOf<A extends keyof ReviewTypes["artifacts"]>(
  result: FlowRunResult<ReviewTypes>,
  type: A,
): ReviewTypes["artifacts"][A][] {
  return result.artifacts
    .filter((artifact) => artifact.type === type)
    .map((artifact) => artifact.data as ReviewTypes["artifacts"][A]);
}

/** A file under review in its own database, with the node payloads for it. */
async function setup(content: string) {
  const { env, wsId } = await openReviewDatabase();
  const { file, version, run } = await Effect.runPromise(
    reviewedFile(content).pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.provide(env)),
  );
  const source = { fileId: file.id, versionId: version.id };
  const apply: MarkContext = {
    ...source,
    runId: run.id,
    categories: [{ id: "grammar", label: "grammar" }],
  };
  return { env, wsId, source, apply };
}

type Setup = Awaited<ReturnType<typeof setup>>;

const readMarks = ({ env, wsId, apply }: Setup) =>
  Effect.runPromise(
    Marks.use((marks) => marks.ofRun(apply.runId)).pipe(
      Effect.provideService(WorkspaceId, { wsId }),
      Effect.provide(env),
    ),
  );

const runFlow = (
  { wsId }: Setup,
  env: Layer.Layer<ModelClient | ReviewTestServices>,
  flow: FlowRunner<ReviewTypes, ReviewServices>,
  graph: FlowGraph<ReviewTypes>,
): Promise<FlowRunResult<ReviewTypes>> =>
  Effect.runPromise(
    flow.run(graph).pipe(Effect.provideService(WorkspaceId, { wsId }), Effect.provide(env)),
  );

test("review runners -- analyze, propose, apply, and synthesize in a flow", async () => {
  const fixture = await setup("hello brave world");
  const { client, inputs } = createFakeClient([
    { text: ANALYSIS_ROUND, reasoning: "reading closely" },
    {
      text: '{"marks":[{"selectedText":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));
  const runners = reviewRunners;
  const events: FlowEvent[] = [];
  const flow = new FlowRunner<ReviewTypes, ReviewServices>({
    runners,
    onEvent: (event) => Effect.sync(() => events.push(event)),
  });

  const graph: FlowGraph<ReviewTypes> = {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: fixture.source,
      },
      {
        id: "structure",
        kind: "analyze",
        dependsOn: ["content"],
        payload: unitPayload("structure", "Analyze the draft."),
      },
      {
        id: "mechanics.propose",
        kind: "mark.propose",
        dependsOn: ["structure", "content"],
        payload: unitPayload("mechanics", "Mark mechanics."),
      },
      {
        id: "mechanics.apply",
        kind: "mark.apply",
        dependsOn: ["mechanics.propose"],
        payload: fixture.apply,
      },
      {
        id: "summary",
        kind: "synthesize",
        dependsOn: ["content", "mechanics.apply"],
        payload: unitPayload("summary", "Summarize."),
      },
    ],
  };

  const result = await runFlow(fixture, env, flow, graph);

  assertEquals(result.errors, []);
  assertEquals(result.status, "completed");
  assertEquals(
    result.artifacts.map((artifact) => artifact.type),
    ["content", "analysis", "mark.proposals", "mark.placed", "summary"],
  );
  assertEquals(result.artifacts[1].producedBy, "structure");
  const placed = artifactsOf(result, "mark.placed").flat();
  assertEquals(
    placed.map((attempt) => [attempt.selectedText, attempt.marked]),
    [["brave", true]],
  );
  assertEquals(artifactsOf(result, "summary")[0], "Solid draft.");
  // The propose prompt carries the referenced analysis content.
  assertEquals(inputs[1].includes("Thesis: Drafts are raw material."), true);
  assertEquals(customs(events), [
    ["structure", "prompt"],
    ["structure", "model_call"],
    ["structure", "reasoning"],
    ["structure", "output"],
    ["mechanics.propose", "prompt"],
    ["mechanics.propose", "model_call"],
    ["mechanics.propose", "output"],
    ["mechanics.apply", "applied"],
    ["summary", "prompt"],
    ["summary", "model_call"],
    ["summary", "output"],
  ]);

  const marks = await readMarks(fixture);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].runId, fixture.apply.runId);
});

test("review runners -- repair propose stays idle without failures", async () => {
  const fixture = await setup("hello world");
  const { client, inputs } = createFakeClient([
    {
      text: '{"marks":[{"selectedText":"hello","comment":"found it","label":"grammar"}]}',
    },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));
  const runners = reviewRunners;
  const flow = new FlowRunner<ReviewTypes, ReviewServices>({ runners });

  const result = await runFlow(fixture, env, flow, {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: fixture.source,
      },
      {
        id: "m.propose",
        kind: "mark.propose",
        dependsOn: ["content"],
        payload: unitPayload("m", "Mark mechanics."),
      },
      {
        id: "m.apply",
        kind: "mark.apply",
        dependsOn: ["m.propose"],
        payload: fixture.apply,
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
        dependsOn: ["m.repair1.gate", "content"],
        payload: unitPayload("m", "Mark mechanics."),
      },
      {
        id: "m.repair1.apply",
        kind: "mark.apply",
        dependsOn: ["m.repair1.propose"],
        payload: fixture.apply,
      },
    ],
  });

  assertEquals(result.status, "completed");
  // The gate forwarded nothing, so the repair propose never called the model and produced no
  // proposals.
  assertEquals(inputs.length, 1);
  assertEquals(
    result.nodeRuns.find((run) => run.nodeId === "m.repair1.propose")?.status,
    "completed",
  );
  const proposals = result.artifacts.filter((artifact) => artifact.type === "mark.proposals");
  assertEquals(proposals.length, 1);
  assertEquals(proposals[0].producedBy, "m.propose");
  const marks = await readMarks(fixture);
  assertEquals(
    marks.map((mark) => mark.selectedText),
    ["hello"],
  );
});

test("review runners -- a repair round re-quotes failed spans", async () => {
  const fixture = await setup("hello world");
  const { client, inputs } = createFakeClient([
    {
      text: '{"marks":[{"selectedText":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    {
      text: '{"marks":[{"selectedText":"hello","comment":"found it","label":"grammar"}]}',
    },
  ]);
  const env = Layer.merge(fixture.env, ModelClient.layerOf(client));
  const runners = reviewRunners;
  const flow = new FlowRunner<ReviewTypes, ReviewServices>({ runners });

  const result = await runFlow(fixture, env, flow, {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: fixture.source,
      },
      {
        id: "m.propose",
        kind: "mark.propose",
        dependsOn: ["content"],
        payload: unitPayload("m", "Mark mechanics."),
      },
      {
        id: "m.apply",
        kind: "mark.apply",
        dependsOn: ["m.propose"],
        payload: fixture.apply,
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
        dependsOn: ["m.repair1.gate", "content"],
        payload: unitPayload("m", "Mark mechanics."),
      },
      {
        id: "m.repair1.apply",
        kind: "mark.apply",
        dependsOn: ["m.repair1.propose"],
        payload: fixture.apply,
      },
    ],
  });

  assertEquals(result.status, "completed");
  assertEquals(
    result.artifacts.map((artifact) => [artifact.type, artifact.producedBy]),
    [
      ["content", "content"],
      ["mark.proposals", "m.propose"],
      ["mark.placed", "m.apply"],
      ["mark.failed", "m.apply"],
      // The gate re-emits the failed artifact unchanged; provenance stays with m.apply.
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

  const marks = await readMarks(fixture);
  assertEquals(
    marks.map((mark) => mark.selectedText),
    ["hello"],
  );
});
