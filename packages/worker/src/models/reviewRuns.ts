import type { CleanupResult, ReviewProgress } from "@essayist/core";
import { computed, createModel, effect, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { deleteJson, getJson, postJson } from "#/models/utils/http.ts";

import type { ReviewRunData, ReviewRunsData, ReviewStreamDetail } from "./reviewRuns.data.ts";
import { type ReviewRunStream, ReviewRunStreamModel } from "./reviewRunStream.ts";

export const ReviewRunsModel = createModel(
  (wsId: string, path: string, detail: ReviewStreamDetail, data?: ReviewRunsData) => {
    const runs = signal<readonly ReviewRunData[]>(data ?? []);

    const [runLoad, { loading: historyLoading, error: historyError }] = createAsyncState();

    // The stream of the running run. A file has at most a single running run.
    const following = signal<{ run: ReviewRunData; stream: ReviewRunStream } | null>(null);
    const lastSettled = signal<ReviewRunData | null>(null);

    const follow = (run: ReviewRunData) => {
      if (import.meta.env.SSR || run.status !== "running") return;
      if (following.peek()?.run.id === run.id) return;
      following.value = { run, stream: new ReviewRunStreamModel(wsId, run.id, detail) };
    };

    const followRunning = (values: readonly ReviewRunData[]) => {
      const running = values.find((run) => run.status === "running");
      if (running !== undefined) follow(running);
    };

    // A settled run replaces its running entry, and its stream is let go.
    effect(() => {
      const current = following.value;
      if (current === null) return;
      const run = current.stream.settled.value;
      if (run === null) return;
      runs.value = runs.peek().map((entry) => (entry.id === run.id ? run : entry));
      lastSettled.value = run;
      following.value = null;
      current.stream[Symbol.dispose]();
    });

    const active = computed((): { run: ReviewRunData; progress: ReviewProgress | null } | null => {
      const current = following.value;
      return current === null
        ? null
        : { run: current.run, progress: current.stream.progress.value };
    });

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path });
      const fresh = await runLoad(async () =>
        getJson<ReviewRunsData>(`/api/workspaces/review-runs?${params}`),
      );
      if (fresh) {
        runs.value = fresh;
        followRunning(fresh);
      }
    }

    if (!import.meta.env.SSR) {
      if (data === undefined) void load();
      else followRunning(data);
    }

    const [runSubmit, { loading, error }] = createAsyncState();

    async function submit(): Promise<ReviewRunData | undefined> {
      const result = await runSubmit(async () =>
        postJson<ReviewRunData>("/api/workspaces/files/review", { wsId, path }),
      );
      if (result !== undefined) {
        follow(result);
        void load();
      }
      return result;
    }

    // Admin-only development cleanup.
    async function cleanup(url: string): Promise<CleanupResult> {
      const result = await deleteJson<CleanupResult>(url);
      void load();
      return result;
    }

    function deleteRun(runId: string): Promise<CleanupResult> {
      const params = new URLSearchParams({ wsId });
      return cleanup(`/api/admin/review-runs/${encodeURIComponent(runId)}?${params}`);
    }

    /** Clear a version, or the whole file without a versionId. */
    function clear(versionId?: string): Promise<CleanupResult> {
      const params = new URLSearchParams({ wsId, path });
      if (versionId !== undefined) params.set("versionId", versionId);
      return cleanup(`/api/admin/review-runs?${params}`);
    }

    return {
      runs,
      active,
      lastSettled,
      loading,
      error,
      historyLoading,
      historyError,
      load,
      submit,
      deleteRun,
      clear,
    };
  },
);

export type ReviewRuns = InstanceType<typeof ReviewRunsModel>;
