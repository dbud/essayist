import { sortBy } from "@std/collections";
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
    wsId,
    path,
    reviewPassId,
    versionId,
    startedAt = Date.now(),
  }: {
    wsId: string;
    path: string;
    reviewPassId: string;
    versionId?: string;
    startedAt?: number;
  }): Promise<ReviewRun> {
    const id = crypto.randomUUID();
    const run: ReviewRun = {
      id,
      wsId,
      path,
      reviewPassId,
      status: "running",
      startedAt,
      ...(versionId && { versionId }),
    };
    await this.#adapter.set([REVIEWS, wsId, id], run);
    return run;
  }

  completeRun({
    wsId,
    id,
    summary,
  }: {
    wsId: string;
    id: string;
    summary: string;
  }): Promise<ReviewRun | undefined> {
    return this.#end(wsId, id, "completed", { summary });
  }

  failRun({
    wsId,
    id,
    error,
  }: {
    wsId: string;
    id: string;
    error: string;
  }): Promise<ReviewRun | undefined> {
    return this.#end(wsId, id, "failed", { error });
  }

  async getRun({
    wsId,
    id,
  }: {
    wsId: string;
    id: string;
  }): Promise<ReviewRun | undefined> {
    return (await this.#adapter.get<ReviewRun>([REVIEWS, wsId, id]))?.value;
  }

  /** List runs for a workspace, newest first. Optionally filtered by file. */
  async listRuns({
    wsId,
    path,
  }: {
    wsId: string;
    path?: string;
  }): Promise<ReviewRun[]> {
    const { entries } = await this.#adapter.list<ReviewRun>([REVIEWS, wsId]);
    return sortBy(
      entries
        .map((e) => e.value)
        .filter((run) => path === undefined || run.path === path),
      (run) => run.startedAt,
      { order: "desc" },
    );
  }

  async #end(
    wsId: string,
    id: string,
    status: ReviewRunStatus,
    extra: { summary?: string; error?: string },
  ): Promise<ReviewRun | undefined> {
    const key: Key = [REVIEWS, wsId, id];
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
