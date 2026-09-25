import type { StepKind } from "@/config/types.ts";

export type ReviewRunStatus = "running" | "completed" | "failed";

export type StepRunStatus = "running" | "completed" | "failed" | "skipped";

/** A review pass run over a file in a workspace. */
export interface ReviewRun {
  id: string;
  wsId: string;
  path: string;
  reviewPassId: string;
  versionId?: string;
  status: ReviewRunStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  /** Final summary text, from the synthesize step when present. */
  summary?: string;
  /** A record per pass step, in pass order. */
  steps: StepRun[];
}

export interface StepRun {
  stepId: string;
  name: string;
  kind: StepKind;
  status: StepRunStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  /** Model ref that served the step call, when known. */
  model?: string;
  marksProposed?: number;
  marksPlaced?: number;
  marksFailed?: number;
  repairRoundsUsed?: number;
}

/** Normalized token usage for a model call. */
export interface ReviewTraceUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cost?: number;
}

/** A proposed mark and its application result. */
export interface MarkAttempt {
  selected_text: string;
  comment: string;
  label?: string;
  line_hint?: number;
  marked: boolean;
  mark_id?: string;
  thread_id?: string;
  error?: string;
}

/**
 * One recorded event from a review run, ordered by `seq`. Events are
 * step-scoped: structured steps emit input, reasoning, and output; mark
 * steps additionally emit application and repair events.
 */
export type ReviewTraceEvent =
  | { type: "step_start"; stepId: string; stepName: string; kind: StepKind }
  | { type: "step_input"; stepId: string; text: string }
  | { type: "step_reasoning"; stepId: string; text: string }
  | {
      type: "step_output";
      stepId: string;
      output: unknown;
      truncated?: boolean;
    }
  | {
      type: "step_output";
      stepId: string;
      output: unknown;
      truncated?: boolean;
    }
  | { type: "marks_applied"; stepId: string; attempts: MarkAttempt[] }
  | { type: "step_repair"; stepId: string; round: number }
  | { type: "step_end"; stepId: string }
  | { type: "step_error"; stepId?: string; error: string }
  | { type: "usage"; stepId: string; usage: ReviewTraceUsage };

/** ReviewTraceEvent with its seq and wall-clock timestamp. */
export type TracedReviewEvent = ReviewTraceEvent & {
  seq: number;
  at: number;
};

/** Receives trace events as they happen. */
export interface ReviewTraceSink {
  record(event: ReviewTraceEvent): void;
  /** Await pending appends and close the sink. */
  flush(): Promise<void>;
}
