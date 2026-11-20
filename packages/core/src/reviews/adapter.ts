import type { Category, ResolvedReviewPass, ResolvedReviewUnit } from "#/config/types.ts";
import type { ForwardSpec, PassWhenSpec } from "#/flow/helpers.ts";
import type { FlowGraph, FlowNodeOf } from "#/flow/types.ts";
import type { ReviewTypes } from "#/reviews/graph.ts";
import type { ReviewPlan } from "#/reviews/progress.ts";

const CONTENT = "content";

/** Binds a graph to a run over one file version. */
export interface ReviewPin {
  runId: string;
  path: string;
  versionId: string;
}

/** Decompose a resolved review pass into a flow graph: a model-call node
 * per unit, with attempt units unrolling their mark subgraph behind gates. Unit inputs stay
 * symbolic (unit ids) until every unit is built; a final pass resolves each unit to the node
 * standing for the finished unit. The source node and every apply node pin the review to one file
 * version; a preview graph (pin omitted) carries an inert pin. */
export function buildReviewGraph(
  pass: ResolvedReviewPass,
  pin?: ReviewPin,
): FlowGraph<ReviewTypes> {
  const nodes: FlowNodeOf<ReviewTypes>[] = [
    {
      id: CONTENT,
      kind: "source",
      dependsOn: [],
      payload: {
        path: pin?.path ?? "",
        versionId: pin?.versionId ?? "",
      },
    },
  ];
  const terminals = new Map<string, string>();
  for (const unit of pass.units) {
    const built = unitNodes(unit, pin);
    nodes.push(...built.nodes);
    terminals.set(unit.id, built.terminalId);
  }
  return {
    nodes: nodes.map((node) => ({
      ...node,
      dependsOn: node.dependsOn.map((dep) => terminals.get(dep) ?? dep),
    })),
  };
}

/** The units of a pass with the graph nodes each one runs, in unit order. */
export function reviewPlan(pass: ResolvedReviewPass): ReviewPlan {
  return new Map(pass.units.map((unit) => [unit.id, unitNodes(unit).nodes.map((node) => node.id)]));
}

/** The nodes of one unit and the node standing for the finished unit. */
function unitNodes(
  unit: ResolvedReviewUnit,
  pin?: ReviewPin,
): { nodes: FlowNodeOf<ReviewTypes>[]; terminalId: string } {
  if (unit.attempt) {
    return markNodes(unit, unit.attempt, pin);
  }
  const kind = unit.summary ? "synthesize" : "analyze";
  return {
    nodes: [
      {
        id: unit.id,
        kind,
        dependsOn: [...unit.inputs, CONTENT],
        payload: unit,
      },
    ],
    terminalId: unit.id,
  };
}

/** The nodes of an attempt unit: propose, apply, gated repair rounds per
 * configured budget, and a collect node re-emitting all placed marks. */
function markNodes(
  unit: ResolvedReviewUnit,
  attempt: { categories: Category[]; repairRounds: number },
  pin?: ReviewPin,
): { nodes: FlowNodeOf<ReviewTypes>[]; terminalId: string } {
  const applyPayload = {
    path: pin?.path ?? "",
    versionId: pin?.versionId ?? "",
    allowedLabels: attempt.categories.map((category) => category.label),
    provenance: { runId: pin?.runId ?? "", unitId: unit.id },
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
  const rounds = attempt.repairRounds;
  const applies = [`${unit.id}.apply`];
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
    applies.push(apply);
    previousApply = apply;
  }
  nodes.push({
    id: `${unit.id}.collect`,
    kind: "mark.collect",
    dependsOn: applies,
    payload: { types: ["mark.placed"] } satisfies ForwardSpec<ReviewTypes>,
  });
  return { nodes, terminalId: `${unit.id}.collect` };
}
