import type { ResolvedReviewPass, ResolvedReviewUnit } from "@/config/types.ts";
import type { PassWhenSpec } from "@/flow/helpers.ts";
import type { FlowGraph, FlowNodeOf } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";

const CONTENT = "content";

/** Decompose a resolved review pass into a flow graph: a model-call node
 * per unit, with attempt units unrolling their mark subgraph behind gates. */
export function buildReviewGraph(
  pass: ResolvedReviewPass,
  runId: string,
): FlowGraph<ReviewTypes> {
  const nodes: FlowNodeOf<ReviewTypes>[] = [
    { id: CONTENT, kind: "source", dependsOn: [] },
  ];
  for (const unit of pass.units) {
    nodes.push(...unitNodes(unit, runId));
  }
  return { nodes };
}

function unitNodes(
  unit: ResolvedReviewUnit,
  runId: string,
): FlowNodeOf<ReviewTypes>[] {
  if (unit.attempt) {
    return markNodes(unit, unit.attempt, runId);
  }
  if (unit.summary) {
    return [
      {
        id: unit.id,
        kind: "synthesize",
        dependsOn: [...unit.inputs, CONTENT],
        payload: unit,
      },
    ];
  }
  return [
    {
      id: unit.id,
      kind: "analyze",
      dependsOn: [...unit.inputs, CONTENT],
      payload: unit,
    },
  ];
}

/** The nodes of an attempt unit: propose, apply, and gated repair
 * rounds per configured budget. */
function markNodes(
  unit: ResolvedReviewUnit,
  attempt: { labels: string[]; repairRounds: number },
  runId: string,
): FlowNodeOf<ReviewTypes>[] {
  const applyPayload = {
    allowedLabels: attempt.labels,
    provenance: { runId, unitId: unit.id },
  };
  const gatePayload: PassWhenSpec<ReviewTypes> = {
    when: (inputs) => inputs.of("mark.failed").length > 0,
    types: ["mark.failed"],
  };
  const nodes: FlowNodeOf<ReviewTypes>[] = [
    {
      id: `${unit.id}.propose`,
      kind: "mark.propose",
      dependsOn: [...unit.inputs, CONTENT],
      payload: unit,
    },
    {
      id: `${unit.id}.apply`,
      kind: "mark.apply",
      dependsOn: [`${unit.id}.propose`],
      payload: applyPayload,
    },
  ];
  const rounds = attempt.repairRounds ?? 1;
  let previousApply = `${unit.id}.apply`;
  for (let round = 1; round <= rounds; round++) {
    const gate = `${unit.id}.repair${round}.gate`;
    const propose = `${unit.id}.repair${round}.propose`;
    const apply = `${unit.id}.repair${round}.apply`;
    nodes.push({
      id: gate,
      kind: "mark.repair.gate",
      dependsOn: [previousApply],
      payload: gatePayload,
    });
    nodes.push({
      id: propose,
      kind: "mark.propose.repair",
      dependsOn: [gate, CONTENT],
      payload: unit,
    });
    nodes.push({
      id: apply,
      kind: "mark.apply",
      dependsOn: [propose],
      payload: applyPayload,
    });
    previousApply = apply;
  }
  return nodes;
}
