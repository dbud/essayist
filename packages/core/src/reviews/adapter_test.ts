import { assertEquals } from "@std/assert";
import type { ResolvedReviewPass, ReviewUnit } from "@/config/types.ts";
import type { ForwardSpec } from "@/flow/helpers.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";

const PROMPTS = {
  system: "You are an editor.",
  directive: "Review the essay.",
  instructions: "",
};

const APPLY_PAYLOAD = {
  allowedLabels: ["grammar"],
  provenance: { runId: "r", unitId: "mechanics" },
};

const COLLECT_PAYLOAD: ForwardSpec<ReviewTypes> = { types: ["mark.placed"] };

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
          categories: [{ id: "grammar", label: "grammar" }],
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
      ["mechanics.propose", "mark.propose", ["analyze", "content"]],
      ["mechanics.apply", "mark.apply", ["mechanics.propose"]],
      ["mechanics.repair1.gate", "mark.repair.gate", ["mechanics.apply"]],
      [
        "mechanics.repair1.propose",
        "mark.propose.repair",
        ["mechanics.repair1.gate", "content"],
      ],
      ["mechanics.repair1.apply", "mark.apply", ["mechanics.repair1.propose"]],
      [
        "mechanics.collect",
        "mark.collect",
        ["mechanics.apply", "mechanics.repair1.apply"],
      ],
      ["summary", "synthesize", ["analyze", "content"]],
    ],
  );
  const payloadOf = (id: string) =>
    graph.nodes.find((node) => node.id === id)?.payload;
  assertEquals(payloadOf("analyze"), pass.units[0]);
  assertEquals(payloadOf("mechanics.apply"), APPLY_PAYLOAD);
  assertEquals(payloadOf("mechanics.collect"), COLLECT_PAYLOAD);
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
        ["mechanics.repair1.gate", "content"],
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
        ["mechanics.repair2.gate", "content"],
      ],
      ["mechanics.repair2.apply", "mark.apply", ["mechanics.repair2.propose"]],
      [
        "mechanics.collect",
        "mark.collect",
        [
          "mechanics.apply",
          "mechanics.repair1.apply",
          "mechanics.repair2.apply",
        ],
      ],
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
    ["content", "mechanics.propose", "mechanics.apply", "mechanics.collect"],
  );
});

Deno.test("buildReviewGraph -- a unit input resolves to the unit's collect node", () => {
  const graph = buildReviewGraph(
    passFixture([
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"], repairRounds: 2 },
      }),
      unitFixture({ id: "summary", summary: true, inputs: ["mechanics"] }),
    ]),
    "r",
  );

  const summary = graph.nodes.find((node) => node.id === "summary");
  assertEquals(summary?.dependsOn, ["mechanics.collect", "content"]);
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
      ["mechanics.propose", ["analyze", "ghost", "content"]],
      ["mechanics.apply", ["mechanics.propose"]],
      ["mechanics.repair1.gate", ["mechanics.apply"]],
      ["mechanics.repair1.propose", ["mechanics.repair1.gate", "content"]],
      ["mechanics.repair1.apply", ["mechanics.repair1.propose"]],
      ["mechanics.collect", ["mechanics.apply", "mechanics.repair1.apply"]],
    ],
  );
});
