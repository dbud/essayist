import { assertEquals } from "@std/assert";
import type { ResolvedReviewPass, ReviewUnit } from "@/config/types.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";

const PROMPTS = {
  system: "You are an editor.",
  directive: "Review the essay.",
  instructions: "",
};

const APPLY_PAYLOAD = {
  allowedLabels: ["grammar"],
  provenance: { runId: "r", unitId: "mechanics" },
};

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
      prompts: PROMPTS,
      pool: { id: "pool", name: "Pool", models: ["m/a"] },
      inputs: unit.inputs ?? [],
      ...(unit.attempt && {
        attempt: {
          labels: ["grammar"],
          repairRounds: unit.attempt.repairRounds ?? 1,
        },
      }),
      ...(unit.summary && { summary: true }),
    })),
  };
}

Deno.test("buildReviewGraph -- decomposes a pass into nodes", () => {
  const pass = passFixture([
    unitFixture({ id: "analyze" }),
    unitFixture({
      id: "mechanics",
      attempt: { allowedCategoryIds: ["grammar"] },
      inputs: ["analyze"],
    }),
    unitFixture({ id: "summary", summary: true, inputs: ["analyze"] }),
  ]);
  const graph = buildReviewGraph(pass, "r");

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
  assertEquals(payloadOf("analyze"), pass.units[0]);
  assertEquals(payloadOf("mechanics.apply"), APPLY_PAYLOAD);
});

Deno.test("buildReviewGraph -- unrolls two repair rounds in a chain", () => {
  const graph = buildReviewGraph(
    passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"], repairRounds: 2 },
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
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"], repairRounds: 0 },
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
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
        inputs: ["analyze", "ghost"],
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
