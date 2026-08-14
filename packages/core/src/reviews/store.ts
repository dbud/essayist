import type { Key, PersistenceAdapter } from "@/persistence/mod.ts";
import type { ReviewRun, ReviewRunStatus } from "./types.ts";

// Key layout:
//   ["reviews", wsId, runId] -> ReviewRun
const REVIEWS = "reviews";

/** CRUD for review runs, scoped per workspace. */
export class ReviewStore {
  #adapter: PersistenceAdapter;

  constructor(adapter: PersistenceAdapter) {
    this.#adapter = adapter;
  }

  /** Create a run in the "running" state. */
  async createRun({
    workspaceId,
    fileId,
    reviewPassId,
    startedAt = Date.now(),
  }: {
    workspaceId: string;
    fileId: string;
    reviewPassId: string;
    startedAt?: number;
  }): Promise<ReviewRun> {
    const id = crypto.randomUUID();
    const run: ReviewRun = {
      id,
      workspaceId,
      fileId,
      reviewPassId,
      status: "running",
      startedAt,
    };
    await this.#adapter.set([REVIEWS, workspaceId, id], run);
    return run;
  }

  completeRun({
    workspaceId,
    id,
    summary,
  }: {
    workspaceId: string;
    id: string;
    summary: string;
  }): Promise<ReviewRun | undefined> {
    return this.#end(workspaceId, id, "completed", { summary });
  }

  failRun({
    workspaceId,
    id,
    error,
  }: {
    workspaceId: string;
    id: string;
    error: string;
  }): Promise<ReviewRun | undefined> {
    return this.#end(workspaceId, id, "failed", { error });
  }

  async getRun({
    workspaceId,
    id,
  }: {
    workspaceId: string;
    id: string;
  }): Promise<ReviewRun | undefined> {
    return (await this.#adapter.get<ReviewRun>([REVIEWS, workspaceId, id]))
      ?.value;
  }

  /** List runs for a workspace, newest first. Optionally filtered by file. */
  async listRuns({
    workspaceId,
    fileId,
  }: {
    workspaceId: string;
    fileId?: string;
  }): Promise<ReviewRun[]> {
    const { entries } = await this.#adapter.list<ReviewRun>([
      REVIEWS,
      workspaceId,
    ]);
    return entries
      .map((e) => e.value)
      .filter((run) => fileId === undefined || run.fileId === fileId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  async #end(
    workspaceId: string,
    id: string,
    status: ReviewRunStatus,
    extra: { summary?: string; error?: string },
  ): Promise<ReviewRun | undefined> {
    const key: Key = [REVIEWS, workspaceId, id];
    const entry = await this.#adapter.get<ReviewRun>(key);
    if (!entry) return undefined;
    const run: ReviewRun = {
      ...entry.value,
      status,
      completedAt: Date.now(),
      ...extra,
    };
    await this.#adapter.batch([{ type: "set", key, value: run }], {
      checks: [{ key, versionstamp: entry.versionstamp }],
    });
    return run;
  }
}
