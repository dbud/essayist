import type { FlowGraph, FlowNodeOf, NodeKind } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";

/** Agentflow shape per review node kind. */
const SHAPES: Record<NodeKind<ReviewTypes>, string> = {
  source: "input",
  analyze: "task",
  "mark.propose": "task",
  "mark.propose.repair": "task",
  "mark.apply": "action",
  "mark.repair.gate": "decision",
  synthesize: "task",
};

/** Agentflow node ids accept word characters only; real ids go to labels. */
function safeId(id: string): string {
  return id.replace(/\W/g, "_");
}

/** Labels are quoted strings; embedded quotes would break them. */
function safeLabel(label: string): string {
  return label.replace(/"/g, "'");
}

function declare(node: FlowNodeOf<ReviewTypes>): string {
  const id = safeId(node.id);
  const label = safeLabel(node.id);
  const box = id === label ? id : `${id}["${label}"]`;
  return `${box}@{ shape: ${SHAPES[node.kind]} }`;
}

/** Derived mark node ids start with "<unitId>."; other ids are bare unit
 * nodes or the source. */
function unitIdOf(id: string): string {
  const dot = id.indexOf(".");
  return dot === -1 ? id : id.slice(0, dot);
}

/**
 * An agentflow-beta definition of a built review graph: the source in a
 * global block, multi-node units in flow containers (single-node units
 * stay bare), dependsOn as sequence edges, and repair gates labeling
 * their outgoing edges. Label = the real node id, so sanitized ids stay
 * parseable while the boxes read exactly like the graph.
 */
export function agentflowDefinition(graph: FlowGraph<ReviewTypes>): string {
  const lines: string[] = ["agentflow-beta TB"];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const containers = new Map<string, FlowNodeOf<ReviewTypes>[]>();
  const sources: FlowNodeOf<ReviewTypes>[] = [];

  for (const node of graph.nodes) {
    if (node.kind === "source") {
      sources.push(node);
      continue;
    }
    const unit = unitIdOf(node.id);
    const group = containers.get(unit);
    if (group) group.push(node);
    else containers.set(unit, [node]);
  }

  const hop = (dep: string): string =>
    nodeById.get(dep)?.kind === "mark.repair.gate"
      ? " -- failed marks -->"
      : " -->";

  if (sources.length > 0) {
    lines.push("", "global");
    for (const node of sources) lines.push(`  ${declare(node)}`);
    lines.push("end");
  }

  for (const [unit, nodes] of containers) {
    if (nodes.length === 1) {
      lines.push("", declare(nodes[0]));
      continue;
    }
    lines.push("", `flow ${safeId(unit)}["${safeLabel(unit)}"]`);
    for (const node of nodes) lines.push(`  ${declare(node)}`);
    lines.push("");
    for (const node of nodes) {
      for (const dep of node.dependsOn) {
        if (dep === node.id) continue;
        const upstream = nodeById.get(dep);
        if (upstream && upstream.kind !== "source" && unitIdOf(dep) === unit) {
          lines.push(`  ${safeId(dep)}${hop(dep)} ${safeId(node.id)}`);
        }
      }
    }
    lines.push("end");
  }

  const cross: string[] = [];
  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      const upstream = nodeById.get(dep);
      if (!upstream) continue;
      if (unitIdOf(dep) === unitIdOf(node.id)) continue;
      cross.push(`${safeId(dep)}${hop(dep)} ${safeId(node.id)}`);
    }
  }
  if (cross.length > 0) lines.push("", ...cross);

  return lines.join("\n");
}
