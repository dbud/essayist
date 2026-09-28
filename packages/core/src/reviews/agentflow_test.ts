import { assertEquals } from "@std/assert";
import type { ResolvedReviewPass, ReviewUnit } from "@/config/types.ts";
import { buildReviewGraph } from "@/reviews/adapter.ts";
import { agentflowDefinition } from "@/reviews/agentflow.ts";

const PROMPTS = {
  system: "You are an editor.",
  directive: "Review the essay.",
  instructions: "",
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

const EMPTY_PASS = `agentflow-beta TB

global
  content@{ shape: input }
end`;

Deno.test("agentflowDefinition -- an empty pass is just the source", () => {
  const graph = buildReviewGraph(passFixture([]), "r");

  assertEquals(agentflowDefinition(graph), EMPTY_PASS);
});

Deno.test("agentflowDefinition -- renders a pass with a mark unit", () => {
  const graph = buildReviewGraph(
    passFixture([
      unitFixture({ id: "analyze" }),
      unitFixture({
        id: "mechanics",
        attempt: { allowedCategoryIds: ["grammar"] },
      }),
      unitFixture({ id: "synthesize", summary: true }),
    ]),
    "r",
  );

  assertEquals(
    agentflowDefinition(graph),
    `${EMPTY_PASS}

analyze@{ shape: task }

flow mechanics["mechanics"]
  mechanics_propose["mechanics.propose"]@{ shape: task }
  mechanics_apply["mechanics.apply"]@{ shape: action }
  mechanics_repair1_gate["mechanics.repair1.gate"]@{ shape: decision }
  mechanics_repair1_propose["mechanics.repair1.propose"]@{ shape: task }
  mechanics_repair1_apply["mechanics.repair1.apply"]@{ shape: action }
  mechanics_collect["mechanics.collect"]@{ shape: input }

  mechanics_propose --> mechanics_apply
  mechanics_apply --> mechanics_repair1_gate
  mechanics_repair1_gate -- failed marks --> mechanics_repair1_propose
  mechanics_repair1_propose --> mechanics_repair1_apply
  mechanics_apply --> mechanics_collect
  mechanics_repair1_apply --> mechanics_collect
end

synthesize@{ shape: task }

content --> analyze
content --> mechanics_propose
content --> mechanics_repair1_propose
content --> synthesize`,
  );
});
