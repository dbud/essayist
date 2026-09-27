import type { FlowEvent, NodeKind } from "@/flow/types.ts";
import type { ReviewTypes } from "@/reviews/graph.ts";

/** Coarse activity label for a running review. */
export type ReviewPhase =
  | "working"
  | "analyzing"
  | "marking"
  | "repairing"
  | "summarizing";

/**
 * Text-free progress snapshot for product UI. Never carries model content:
 * inputs, outputs, and usage are dropped at derivation.
 */
export interface ReviewProgress {
  phase: ReviewPhase;
  notes: number;
}

const KIND_PHASE: Record<NodeKind<ReviewTypes>, ReviewPhase> = {
  source: "working",
  analyze: "analyzing",
  "mark.propose": "marking",
  "mark.propose.repair": "repairing",
  "mark.apply": "marking",
  "mark.repair.gate": "repairing",
  synthesize: "summarizing",
};

/**
 * Maps trace events onto ReviewProgress snapshots, emitting on change.
 * The kind of a node id comes from the run's graph; unknown ids fall back
 * to the working phase.
 */
export class ReviewProgressTracker {
  #kindOf: Map<string, NodeKind<ReviewTypes>>;
  #phase: ReviewPhase = "working";
  #notes = 0;
  #onProgress: (progress: ReviewProgress) => void;

  constructor(
    onProgress: (progress: ReviewProgress) => void,
    kindOf: Map<string, NodeKind<ReviewTypes>>,
  ) {
    this.#onProgress = onProgress;
    this.#kindOf = kindOf;
    this.#emit();
  }

  handle(event: FlowEvent<ReviewTypes>): void {
    switch (event.type) {
      case "node_start":
        this.#phase = KIND_PHASE[this.#kindOf.get(event.nodeId) ?? "source"];
        break;
      case "custom":
        if (event.event.type !== "applied") return;
        this.#notes += event.event.attempts.filter(
          (attempt) => attempt.marked,
        ).length;
        break;
      default:
        return;
    }
    this.#emit();
  }

  #emit(): void {
    this.#onProgress({ phase: this.#phase, notes: this.#notes });
  }
}
