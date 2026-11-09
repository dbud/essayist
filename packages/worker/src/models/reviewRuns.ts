import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, postJson } from "#/models/utils/http.ts";

import { pingSample, pulseStore, sampleFromEvent } from "./reviewPulse.ts";
import type { ReviewRunData, ReviewRunsData } from "./reviewRuns.data.ts";
import { observeReviewRun } from "./reviewStream.ts";

export const ReviewRunsModel = createModel((wsId: string, path: string, data?: ReviewRunsData) => {
  const runs = signal<readonly ReviewRunData[]>(data ?? []);

  const [runLoad, { loading: historyLoading, error: historyError }] = createAsyncState();

  const observeRun = (run: ReviewRunData) => {
    observeReviewRun(wsId, run.id, {
      onTrace: (event) => pulseStore.push(run.id, sampleFromEvent(event)),
      onPing: () => pulseStore.push(run.id, pingSample()),
      onSettled: () => void load(),
    });
  };

  const observeRunning = (values: ReviewRunsData) => {
    for (const run of values) {
      if (run.status === "running") observeRun(run);
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
      observeRun(result);
    }
    return result;
  }

  return { runs, loading, error, historyLoading, historyError, load, submit };
});

export type ReviewRuns = InstanceType<typeof ReviewRunsModel>;
