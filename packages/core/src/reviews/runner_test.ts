import type { ModelResult, Tool } from "@openrouter/agent";
import { assertEquals } from "@std/assert";
import { Agent, type ModelClient } from "@/agent.ts";
import type { ResolvedReviewPass, Step } from "@/config/types.ts";
import { InMemoryAdapter } from "@/persistence/mod.ts";
import { runReviewPass } from "@/reviews/runner.ts";
import { ReviewStore } from "@/reviews/store.ts";
import { EventTraceStore } from "@/reviews/trace.ts";
import { createFile } from "@/vfs/testing/helpers.ts";

interface FakeRound {
  text: string;
  reasoning?: string;
}

function fakeResult(round: FakeRound): ModelResult<readonly Tool[]> {
  return {
    getText: () => Promise.resolve(round.text),
    getItemsStream: async function* () {},
    getFullResponsesStream: async function* () {
      if (round.reasoning !== undefined) {
        yield {
          type: "response.output_item.done",
          item: {
            type: "reasoning",
            content: [{ text: round.reasoning }],
            summary: [],
          },
        };
      }
    },
    getUsage: () =>
      Promise.resolve({
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        cachedTokens: 0,
        reasoningTokens: 0,
        modelCalls: 1,
      }),
    cancel: () => {},
  } as unknown as ModelResult<readonly Tool[]>;
}

function createSpyClient(rounds: FakeRound[]): {
  agent: Agent;
  inputs: string[];
} {
  const inputs: string[] = [];
  const client: ModelClient = {
    callModel: (request: { input: string }) => {
      inputs.push(request.input);
      return fakeResult(rounds[Math.min(inputs.length - 1, rounds.length - 1)]);
    },
  };
  return { agent: new Agent("test-key", client), inputs };
}

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

Deno.test("runReviewPass -- completes a pass and records steps, marks, and trace", async () => {
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
      stepFixture({ id: "mechanics", name: "Mechanics", kind: "mark" }),
      stepFixture({ id: "synthesize", name: "Synthesize", kind: "synthesize" }),
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "completed");
  assertEquals(run.summary, "Solid draft.");
  assertEquals(
    run.steps.map((step) => [step.stepId, step.status]),
    [
      ["analyze", "completed"],
      ["mechanics", "completed"],
      ["synthesize", "completed"],
    ],
  );
  assertEquals(run.steps[1].marksProposed, 1);
  assertEquals(run.steps[1].marksPlaced, 1);
  assertEquals(run.steps[1].marksFailed, 0);
  assertEquals(run.steps[1].repairRoundsUsed, 0);

  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "brave");
  assertEquals(marks[0].meta, {
    runId: run.id,
    stepId: "mechanics",
  });

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(
    trace.map((event) => event.type),
    [
      "step_start",
      "step_input",
      "step_reasoning",
      "step_output",
      "usage",
      "step_end",
      "step_start",
      "step_input",
      "step_output",
      "usage",
      "marks_applied",
      "step_end",
      "step_start",
      "step_input",
      "step_output",
      "usage",
      "step_end",
    ],
  );
  assertEquals(inputs.length, 3);
});

Deno.test("runReviewPass -- repairs failed marks within budget", async () => {
  const { vfs, versionId } = await createFile("essay.txt", "hello world");
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([
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
  assertEquals(run.steps[0].marksProposed, 2);
  assertEquals(run.steps[0].marksPlaced, 1);
  assertEquals(run.steps[0].marksFailed, 0);
  assertEquals(run.steps[0].repairRoundsUsed, 1);

  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(
    trace.filter((event) => event.type === "marks_applied").length,
    2,
  );
  assertEquals(trace.filter((event) => event.type === "step_repair").length, 1);
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks[0].selected_text, "hello");
});

Deno.test("runReviewPass -- keeps failed marks when the budget is spent", async () => {
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
  assertEquals(run.steps[0].marksProposed, 1);
  assertEquals(run.steps[0].marksPlaced, 0);
  assertEquals(run.steps[0].marksFailed, 1);
  assertEquals(run.steps[0].repairRoundsUsed, 0);
  const marks = await vfs.getMarks("essay.txt", versionId);
  assertEquals(marks, []);
});

Deno.test("runReviewPass -- a step error fails the run", async () => {
  const { vfs } = await createFile("essay.txt", "hello world");
  const { reviewStore, traceStore } = setup();
  const { agent } = createSpyClient([
    { text: "not json" },
    { text: "still bad" },
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
    ]),
    wsId: "ws",
    path: "essay.txt",
  });

  assertEquals(run.status, "failed");
  assertEquals(run.error?.includes("not valid JSON"), true);
  assertEquals(run.steps[0].status, "failed");
  assertEquals(
    run.steps.map((step) => step.stepId),
    ["analyze"],
  );
  const trace = (await traceStore.get({ wsId: "ws", runId: run.id })) ?? [];
  assertEquals(
    trace.some((event) => event.type === "step_error"),
    true,
  );
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
});
