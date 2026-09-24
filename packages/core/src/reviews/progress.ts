import type { StepKind } from "@/config/types.ts";
import type { ReviewTraceEvent } from "./types.ts";

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
  /** Current step, absent until the first step starts. */
  stepId?: string;
  stepName?: string;
  phase: ReviewPhase;
  notes: number;
}

const KIND_PHASE: Record<StepKind, ReviewPhase> = {
  analyze: "analyzing",
  mark: "marking",
  synthesize: "summarizing",
};

/**
 * Maps trace events onto ReviewProgress snapshots, emitting on change.
 */
export class ReviewProgressTracker {
  #stepId: string | undefined;
  #stepName: string | undefined;
  #phase: ReviewPhase = "working";
  #notes = 0;
  #onProgress: (progress: ReviewProgress) => void;

  constructor(onProgress: (progress: ReviewProgress) => void) {
    this.#onProgress = onProgress;
    this.#emit();
  }

  handle(event: ReviewTraceEvent): void {
    switch (event.type) {
      case "step_start":
        this.#stepId = event.stepId;
        this.#stepName = event.stepName;
        this.#phase = KIND_PHASE[event.kind];
        break;
      case "marks_applied":
        this.#notes += event.attempts.filter((a) => a.marked).length;
        break;
      case "step_repair":
        this.#phase = "repairing";
        break;
      default:
        return;
    }
    this.#emit();
  }

  #emit(): void {
    this.#onProgress({
      stepId: this.#stepId,
      stepName: this.#stepName,
      phase: this.#phase,
      notes: this.#notes,
    });
  }
}
