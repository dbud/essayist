export type ReviewRunStatus = "running" | "completed" | "failed";

/** A single review pass over one file in a workspace. */
export interface ReviewRun {
  id: string;
  workspaceId: string;
  fileId: string;
  reviewPassId: string;
  status: ReviewRunStatus;
  startedAt: number;
  completedAt?: number;
  error?: string;
  summary?: string;
}

/** Normalized token usage for one model round. */
export interface ReviewTraceUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cost?: number;
}

/**
 * One recorded event from a review run's agent loop, ordered by `seq`.
 * Rounds use the SDK's turn numbering: 0 is the initial request.
 */
export type ReviewTraceEvent =
  | { type: "input"; text: string }
  | { type: "round_start"; round: number }
  | { type: "reasoning"; round: number; text: string }
  | { type: "message"; round: number; text: string }
  | {
      type: "tool_call";
      round: number;
      callId: string;
      name: string;
      args: unknown;
      truncated?: boolean;
    }
  | {
      type: "tool_output";
      round: number;
      callId: string;
      output: unknown;
      truncated?: boolean;
    }
  | { type: "round_end"; round: number }
  | { type: "usage"; round: number; usage: ReviewTraceUsage }
  | { type: "error"; round?: number; error: string };

/** ReviewTraceEvent with its seq and wall-clock timestamp. */
export type TracedReviewEvent = ReviewTraceEvent & {
  seq: number;
  at: number;
};

/** Receives trace events as they happen. */
export interface ReviewTraceSink {
  record(event: ReviewTraceEvent): void;
}
