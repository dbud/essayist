import type { FlowEvent } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";

/** The engine's event stream stamped with its seq and wall-clock time. */
export type TraceEvent = FlowEvent<ReviewTypes> & {
  seq: number;
  at: number;
};
