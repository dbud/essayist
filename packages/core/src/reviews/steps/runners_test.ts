import { openKv } from "@deno/kv";
import { assertEquals } from "@std/assert";
import { Effect, Layer } from "effect";
import { test } from "vitest";

import type { ResolvedReviewUnit } from "#/config/types.ts";
import { Files } from "#/files/service.ts";
import type { PassWhenSpec } from "#/flow/helpers.ts";
import { FlowRunner } from "#/flow/runner.ts";
import type { Artifact, Artifacts, FlowEvent, FlowGraph, FlowRunResult } from "#/flow/types.ts";
import { Marks } from "#/marks/service.ts";
import type { Mark } from "#/marks/types.ts";
import { createFakeClient } from "#/model/fake_client.ts";
import { ModelClient } from "#/model/service.ts";
import { kvLayer } from "#/persistence/kv_layer.ts";
import {
  type ReviewNodeEvent,
  type ReviewServices,
  type ReviewTypes,
  reviewRunners,
} from "#/reviews/graph.ts";
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
    .filter((artifact): artifact is Artifact<ReviewTypes, A> => artifact.type === type)
    .map((artifact) => artifact.data);
}

/** One shared KV per test, seeded through the Files service. */
async function setup(content: string) {
  const kv = await openKv();
  const env = Layer.provide(
    Layer.mergeAll(Files.layerNoDeps, Layer.provide(Marks.layerNoDeps, Files.layerNoDeps)),
    kvLayer(kv),
  );
  const versionId = await Effect.runPromise(
    Effect.provide(
      Effect.provideService(
        Effect.gen(function* () {
          const files = yield* Files;
          const write = yield* files.write("essay.txt", content);
          return write.version_id;
        }),
        WorkspaceId,
        { wsId: "ws" },
      ),
      env,
    ),
  );
  return { env, versionId };
}

const readMarks = (
  env: Layer.Layer<ModelClient | Files | Marks>,
  versionId: string,
): Promise<Mark[]> =>
  Effect.runPromise(
    Effect.provide(
      Effect.provideService(
        Files.use((files) => files.getMarks("essay.txt", versionId)),
        WorkspaceId,
        { wsId: "ws" },
      ),
      env,
    ),
  );

const runFlow = (
  env: Layer.Layer<ModelClient | Files | Marks>,
  flow: FlowRunner<ReviewTypes, ReviewServices>,
  graph: FlowGraph<ReviewTypes>,
): Promise<FlowRunResult<ReviewTypes>> =>
  Effect.runPromise(
    Effect.provide(Effect.provideService(flow.run(graph), WorkspaceId, { wsId: "ws" }), env),
  );

test("review runners -- analyze, propose, apply, and synthesize in a flow", async () => {
  const { env: baseEnv, versionId } = await setup("hello brave world");
  const { client, inputs } = createFakeClient([
    { text: ANALYSIS_ROUND, reasoning: "reading closely" },
    {
      text: '{"marks":[{"selected_text":"brave","comment":"Good.","label":"grammar"}]}',
    },
    { text: '{"summary":"Solid draft."}' },
  ]);
  const env = Layer.merge(baseEnv, ModelClient.layerOf(client));
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
        payload: { path: "essay.txt", versionId },
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
        payload: {
          path: "essay.txt",
          versionId,
          allowedLabels: ["grammar"],
          provenance: { runId: "r", unitId: "mechanics" },
        },
      },
      {
        id: "summary",
        kind: "synthesize",
        dependsOn: ["content", "mechanics.apply"],
        payload: unitPayload("summary", "Summarize."),
      },
    ],
  };

  const result = await runFlow(env, flow, graph);

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

  const marks = await readMarks(env, versionId);
  assertEquals(marks.length, 1);
  assertEquals(marks[0].meta, { runId: "r", unitId: "mechanics" });
});

test("review runners -- repair propose stays idle without failures", async () => {
  const { env: baseEnv, versionId } = await setup("hello world");
  const { client, inputs } = createFakeClient([
    {
      text: '{"marks":[{"selected_text":"hello","comment":"found it","label":"grammar"}]}',
    },
  ]);
  const env = Layer.merge(baseEnv, ModelClient.layerOf(client));
  const runners = reviewRunners;
  const provenance = { runId: "r", unitId: "m" };
  const flow = new FlowRunner<ReviewTypes, ReviewServices>({ runners });

  const result = await runFlow(env, flow, {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: { path: "essay.txt", versionId },
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
        payload: {
          path: "essay.txt",
          versionId,
          allowedLabels: ["grammar"],
          provenance,
        },
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
        payload: {
          path: "essay.txt",
          versionId,
          allowedLabels: ["grammar"],
          provenance,
        },
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
  const marks = await readMarks(env, versionId);
  assertEquals(
    marks.map((mark) => mark.selected_text),
    ["hello"],
  );
});

test("review runners -- a repair round re-quotes failed spans", async () => {
  const { env: baseEnv, versionId } = await setup("hello world");
  const { client, inputs } = createFakeClient([
    {
      text: '{"marks":[{"selected_text":"ghost span","comment":"not there","label":"grammar"}]}',
    },
    {
      text: '{"marks":[{"selected_text":"hello","comment":"found it","label":"grammar"}]}',
    },
  ]);
  const env = Layer.merge(baseEnv, ModelClient.layerOf(client));
  const runners = reviewRunners;
  const provenance = { runId: "r", unitId: "m" };
  const flow = new FlowRunner<ReviewTypes, ReviewServices>({ runners });

  const result = await runFlow(env, flow, {
    nodes: [
      {
        id: "content",
        kind: "source",
        dependsOn: [],
        payload: { path: "essay.txt", versionId },
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
        payload: {
          path: "essay.txt",
          versionId,
          allowedLabels: ["grammar"],
          provenance,
        },
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
        payload: {
          path: "essay.txt",
          versionId,
          allowedLabels: ["grammar"],
          provenance,
        },
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

  const marks = await readMarks(env, versionId);
  assertEquals(
    marks.map((mark) => mark.selected_text),
    ["hello"],
  );
});
