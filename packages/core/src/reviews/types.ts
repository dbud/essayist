export type ReviewRunStatus = "running" | "completed" | "failed";

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
