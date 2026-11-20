import type { CleanupResult } from "@essayist/core";
import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { deleteJson, getJson, postJson } from "#/models/utils/http.ts";

import type { ReviewRunData, ReviewRunsData, ReviewStreamDetail } from "./reviewRuns.data.ts";
import { observeReviewRun } from "./reviewStream.ts";

export const ReviewRunsModel = createModel(
  (wsId: string, path: string, detail: ReviewStreamDetail, data?: ReviewRunsData) => {
    const runs = signal<readonly ReviewRunData[]>(data ?? []);

    const [runLoad, { loading: historyLoading, error: historyError }] = createAsyncState();

    const observeRunning = (values: ReviewRunsData) => {
      for (const run of values) {
        if (run.status === "running") observeReviewRun(wsId, run.id, detail);
      }
    };

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path });
      const fresh = await runLoad(async () =>
        getJson<ReviewRunsData>(`/api/workspaces/review-runs?${params}`),
      );
      if (fresh) {
        runs.value = fresh;
        observeRunning(fresh);
      }
    }

    if (!import.meta.env.SSR) {
      if (data === undefined) void load();
      else observeRunning(data);
    }

    const [runSubmit, { loading, error }] = createAsyncState();

    async function submit(): Promise<ReviewRunData | undefined> {
      const result = await runSubmit(async () =>
        postJson<ReviewRunData>("/api/workspaces/files/review", { wsId, path }),
      );
      if (result !== undefined) {
        void load();
        observeReviewRun(wsId, result.id, detail);
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
