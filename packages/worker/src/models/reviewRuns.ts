import type { ReviewRun } from "@essayist/core";
import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, postJson } from "#/models/utils/http.ts";

import type { ReviewRunsData } from "./reviewRuns.data.ts";

export const ReviewRunsModel = createModel((wsId: string, path: string, data?: ReviewRunsData) => {
  const runs = signal<readonly ReviewRun[]>(data ?? []);

  const [runLoad, { loading: historyLoading, error: historyError }] = createAsyncState();

  async function load(): Promise<void> {
    const params = new URLSearchParams({ wsId, path });
    const fresh = await runLoad(async () =>
      getJson<ReviewRunsData>(`/api/workspaces/review-runs?${params}`),
    );
    if (fresh) runs.value = fresh;
  }

  if (data === undefined && !import.meta.env.SSR) void load();

  const [runSubmit, { loading, error }] = createAsyncState();

  async function submit(): Promise<ReviewRun | undefined> {
    const result = await runSubmit(async () =>
      postJson<ReviewRun>("/api/workspaces/files/review", { wsId, path }),
    );
    if (result !== undefined) {
      void load();
    }
    return result;
  }

  return { runs, loading, error, historyLoading, historyError, load, submit };
});

export type ReviewRuns = InstanceType<typeof ReviewRunsModel>;
