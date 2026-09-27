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
  /** Final summary text, from the summary artifact when present. */
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
