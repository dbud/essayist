import type { ReviewTraceEvent } from "./types.ts";

/** Coarse activity label for a running review. */
export type ReviewPhase = "working" | "reading" | "annotating" | "summarizing";

/**
 * Text-free progress snapshot for product UI. Never carries model content:
 * reasoning, message text, tool arguments, and usage are dropped at
 * derivation.
 */
export interface ReviewProgress {
  phase: ReviewPhase;
  round: number;
  notes: number;
}

/**
 * Maps trace events onto ReviewProgress snapshots, emitting on change.
 */
export class ReviewProgressTracker {
  #phase: ReviewPhase = "working";
  #round = 0;
  #notes = 0;
  #onProgress: (progress: ReviewProgress) => void;

  constructor(onProgress: (progress: ReviewProgress) => void) {
    this.#onProgress = onProgress;
    this.#emit();
  }

  handle(event: ReviewTraceEvent): void {
    const prev = { phase: this.#phase, round: this.#round, notes: this.#notes };
    switch (event.type) {
      case "round_start":
        this.#round = event.round;
        break;
      case "tool_call":
        this.#phase = toolPhase(event.name);
        break;
      case "tool_output":
        this.#notes += countPlaced(event.output);
        break;
      case "message":
        this.#phase = "summarizing";
        break;
      default:
        return;
    }
    if (
      prev.phase !== this.#phase ||
      prev.round !== this.#round ||
      prev.notes !== this.#notes
    ) {
      this.#emit();
    }
  }

  #emit(): void {
    this.#onProgress({
      phase: this.#phase,
      round: this.#round,
      notes: this.#notes,
    });
  }
}

function toolPhase(name: string): ReviewPhase {
  if (name === "mark") return "annotating";
  if (name === "read_file" || name === "list_files" || name === "grep") {
    return "reading";
  }
  return "working";
}

/** Count successfully placed marks in a mark tool output, if parseable. */
function countPlaced(output: unknown): number {
  const results = (output as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return 0;
  return results.filter((r) => (r as { marked?: boolean })?.marked === true)
    .length;
}
