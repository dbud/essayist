import { assertEquals } from "@std/assert";
import type { ResolvedReviewPass, Step } from "@/config/types.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";

const PROMPTS = {
  system: "You are an editor.",
  directive: "Review the essay.",
  instructions: "",
  models: ["m/a"],
};

const APPLY_PAYLOAD = {
  allowedLabels: ["grammar"],
  provenance: { runId: "r", unitId: "mechanics" },
};

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
      directive: "Review the essay.",
      instructions: "",
      categories: [],
      allowedLabels: step.kind === "mark" ? ["grammar"] : [],
    })),
  };
}

Deno.test("buildReviewGraph -- decomposes a pass into nodes", () => {
  const graph = buildReviewGraph(
    passFixture([
      stepFixture({ id: "analyze", name: "Analyze", kind: "analyze" }),
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        artifactsFromStepIds: ["analyze"],
      }),
      stepFixture({
        id: "summary",
        name: "Summary",
        kind: "synthesize",
        artifactsFromStepIds: ["analyze"],
      }),
    ]),
    "r",
  );

  assertEquals(
    graph.nodes.map((node) => [node.id, node.kind, node.dependsOn]),
    [
      ["content", "source", []],
      ["analyze", "analyze", ["content"]],
      ["mechanics.propose", "mark.propose", ["content", "analyze"]],
      ["mechanics.apply", "mark.apply", ["mechanics.propose"]],
      ["mechanics.repair1.gate", "mark.repair.gate", ["mechanics.apply"]],
      [
        "mechanics.repair1.propose",
        "mark.propose.repair",
        ["content", "mechanics.repair1.gate"],
      ],
      ["mechanics.repair1.apply", "mark.apply", ["mechanics.repair1.propose"]],
      ["summary", "synthesize", ["content", "analyze"]],
    ],
  );
  const payloadOf = (id: string) =>
    graph.nodes.find((node) => node.id === id)?.payload;
  assertEquals(payloadOf("analyze"), PROMPTS);
  assertEquals(payloadOf("mechanics.apply"), APPLY_PAYLOAD);
});

Deno.test("buildReviewGraph -- unrolls two repair rounds in a chain", () => {
  const graph = buildReviewGraph(
    passFixture([
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        repairRounds: 2,
      }),
    ]),
    "r",
  );

  assertEquals(
    graph.nodes.map((node) => [node.id, node.kind, node.dependsOn]),
    [
      ["content", "source", []],
      ["mechanics.propose", "mark.propose", ["content"]],
      ["mechanics.apply", "mark.apply", ["mechanics.propose"]],
      ["mechanics.repair1.gate", "mark.repair.gate", ["mechanics.apply"]],
      [
        "mechanics.repair1.propose",
        "mark.propose.repair",
        ["content", "mechanics.repair1.gate"],
      ],
      ["mechanics.repair1.apply", "mark.apply", ["mechanics.repair1.propose"]],
      [
        "mechanics.repair2.gate",
        "mark.repair.gate",
        ["mechanics.repair1.apply"],
      ],
      [
        "mechanics.repair2.propose",
        "mark.propose.repair",
        ["content", "mechanics.repair2.gate"],
      ],
      ["mechanics.repair2.apply", "mark.apply", ["mechanics.repair2.propose"]],
    ],
  );
});

Deno.test("buildReviewGraph -- a zero budget has no repair nodes", () => {
  const graph = buildReviewGraph(
    passFixture([
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        repairRounds: 0,
      }),
    ]),
    "r",
  );

  assertEquals(
    graph.nodes.map((node) => node.id),
    ["content", "mechanics.propose", "mechanics.apply"],
  );
});

Deno.test("buildReviewGraph -- artifact references pass through as deps", () => {
  const graph = buildReviewGraph(
    passFixture([
      stepFixture({
        id: "mechanics",
        name: "Mechanics",
        kind: "mark",
        artifactsFromStepIds: ["analyze", "ghost"],
      }),
    ]),
    "r",
  );

  assertEquals(
    graph.nodes.map((node) => [node.id, node.dependsOn]),
    [
      ["content", []],
      ["mechanics.propose", ["content", "analyze", "ghost"]],
      ["mechanics.apply", ["mechanics.propose"]],
      ["mechanics.repair1.gate", ["mechanics.apply"]],
      ["mechanics.repair1.propose", ["content", "mechanics.repair1.gate"]],
      ["mechanics.repair1.apply", ["mechanics.repair1.propose"]],
    ],
  );
});
