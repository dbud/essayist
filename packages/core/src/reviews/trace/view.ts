import type { NodeKind } from "@/flow/types.ts";
import type { ReviewNodeEvent, ReviewTypes } from "@/reviews/graph.ts";
import type { TraceEvent } from "./types.ts";

/** The events and lifecycle of a single node. */
export interface TraceNodeView {
  nodeId: string;
  kind?: NodeKind<ReviewTypes>;
  /** Absent on a node that never started, which only ever skips. */
  startedAt?: number;
  completedAt?: number;
  status?: "completed" | "failed" | "skipped";
  error?: string;
  reason?: string;
  events: ReviewNodeEvent[];
}

/** Summed across every model call's usage, attached or orphaned. */
export interface TraceTotals {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  /** Model calls seen; a call that reports no usage still counts. */
  modelCalls: number;
}

/** A trace folded into per-node sections, for rendering. */
export interface TraceView {
  /** First-start order; a node started again without a node_end appends to
   * the existing entry. */
  nodes: TraceNodeView[];
  /** Events with no node to attach to: a custom event before any
   * node_start, or one naming a node the trace never opened. */
  orphans: TraceEvent[];
  totals: TraceTotals;
}

/**
 * Folds a node-scoped trace into per-node views, preserving seq order.
 * A custom event attaches to the most recently started node that has not
 * ended; anything else is an orphan. A node_end with no node_start still
 * opens a section, so a node skipped for a failed dependency is visible.
 */
export function groupTraceNodes(
  trace: readonly TraceEvent[],
  kindOf?: Map<string, NodeKind<ReviewTypes>>,
): TraceView {
  const nodes: TraceNodeView[] = [];
  const orphans: TraceEvent[] = [];
  const byId = new Map<string, TraceNodeView>();
  const totals: TraceTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    modelCalls: 0,
  };
  let open: TraceNodeView | undefined;

  for (const event of trace) {
    switch (event.type) {
      case "node_start": {
        const existing = byId.get(event.nodeId);
        if (existing && existing.status === undefined) {
          // Reopened without a node_end; treat as the same section.
          open = existing;
        } else {
          open = section(event.nodeId, event.at);
        }
        break;
      }
      case "node_end": {
        const target =
          byId.get(event.nodeId) ?? section(event.nodeId, event.at);
        applyRun(target, event.run);
        if (open === target) open = undefined;
        break;
      }
      case "custom": {
        const target = byId.get(event.nodeId) ?? open;
        if (!target) {
          orphans.push(event);
          break;
        }
        target.events.push(event.event);
        if (event.event.type === "model_call") {
          totals.modelCalls += 1;
          const usage = event.event.call.usage;
          if (usage) {
            totals.inputTokens += usage.inputTokens;
            totals.outputTokens += usage.outputTokens;
            totals.cost += usage.cost ?? 0;
          }
        }
        break;
      }
    }
  }
  return { nodes, orphans, totals };

  function section(nodeId: string, at: number): TraceNodeView {
    const view: TraceNodeView = {
      nodeId,
      kind: kindOf?.get(nodeId),
      startedAt: at,
      events: [],
    };
    nodes.push(view);
    byId.set(nodeId, view);
    return view;
  }
}

function applyRun(
  view: TraceNodeView,
  run: Extract<TraceEvent, { type: "node_end" }>["run"],
): void {
  view.status = run.status;
  switch (run.status) {
    case "completed":
    case "failed":
      view.completedAt = run.completedAt;
      view.startedAt = run.startedAt;
      break;
    case "skipped":
      // A skipped node never ran, so it has no start time of its own.
      view.startedAt = undefined;
      view.reason = run.reason;
      break;
  }
  if (run.status === "failed") view.error = run.error;
}
