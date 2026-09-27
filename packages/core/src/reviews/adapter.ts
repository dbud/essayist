import type { ResolvedReviewPass, ResolvedStep } from "@/config/types.ts";
import type { PassWhenSpec } from "@/flow/helpers.ts";
import type { FlowGraph, FlowNodeOf } from "@/flow/types.ts";
import type { Prompts, ReviewTypes } from "@/reviews/graph.ts";

const CONTENT = "content";

/** Decompose a resolved review pass into a flow graph: one node set per
 * step, with mark steps unrolling their repair rounds behind gates. */
export function buildReviewGraph(
  pass: ResolvedReviewPass,
  runId: string,
): FlowGraph<ReviewTypes> {
  const nodes: FlowNodeOf<ReviewTypes>[] = [
    { id: CONTENT, kind: "source", dependsOn: [] },
  ];
  for (const resolved of pass.steps) {
    const deps = [CONTENT, ...(resolved.step.artifactsFromStepIds ?? [])];
    switch (resolved.step.kind) {
      case "analyze":
        nodes.push({
          id: resolved.step.id,
          kind: "analyze",
          dependsOn: deps,
          payload: promptsOf(resolved),
        });
        break;
      case "mark":
        nodes.push(...markNodes(resolved, runId));
        break;
      case "synthesize":
        nodes.push({
          id: resolved.step.id,
          kind: "synthesize",
          dependsOn: deps,
          payload: promptsOf(resolved),
        });
        break;
    }
  }
  return { nodes };
}

function promptsOf(resolved: ResolvedStep): Prompts {
  return {
    system: resolved.systemPrompt,
    directive: resolved.directive,
    instructions: resolved.instructions,
    models: resolved.modelRefs,
  };
}

/** The nodes of a mark step: propose, apply, and one gated repair round
 * per configured budget. */
function markNodes(
  resolved: ResolvedStep,
  runId: string,
): FlowNodeOf<ReviewTypes>[] {
  const step = resolved.step;
  const prompts = promptsOf(resolved);
  const applyPayload = {
    allowedLabels: resolved.allowedLabels,
    provenance: { runId, unitId: step.id },
  };
  const gatePayload: PassWhenSpec<ReviewTypes> = {
    when: (inputs) => inputs.of("mark.failed").length > 0,
    types: ["mark.failed"],
  };
  const nodes: FlowNodeOf<ReviewTypes>[] = [
    {
      id: `${step.id}.propose`,
      kind: "mark.propose",
      dependsOn: [CONTENT, ...(step.artifactsFromStepIds ?? [])],
      payload: prompts,
    },
    {
      id: `${step.id}.apply`,
      kind: "mark.apply",
      dependsOn: [`${step.id}.propose`],
      payload: applyPayload,
    },
  ];
  const rounds = step.repairRounds ?? 1;
  let previousApply = `${step.id}.apply`;
  for (let round = 1; round <= rounds; round++) {
    const gate = `${step.id}.repair${round}.gate`;
    const propose = `${step.id}.repair${round}.propose`;
    const apply = `${step.id}.repair${round}.apply`;
    nodes.push({
      id: gate,
      kind: "mark.repair.gate",
      dependsOn: [previousApply],
      payload: gatePayload,
    });
    nodes.push({
      id: propose,
      kind: "mark.propose.repair",
      dependsOn: [CONTENT, gate],
      payload: prompts,
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
