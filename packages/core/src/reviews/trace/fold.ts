import type { Artifact } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";
import type { TraceEvent } from "./types.ts";

/**
 * The resume state of a run: nodes that completed, with what they committed.
 *
 * A later `node_end` for the same node wins, so a node re-run in a resumed
 * attempt reports its newest artifacts.
 */
export function foldCompleted(
  trace: readonly TraceEvent[],
): Map<string, Artifact<ReviewTypes>[]> {
  const completed = new Map<string, Artifact<ReviewTypes>[]>();
  for (const event of trace) {
    if (event.type !== "node_end") continue;
    if (event.run.status !== "completed") continue;
    completed.set(event.nodeId, event.run.artifacts);
  }
  return completed;
}
