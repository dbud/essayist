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
