import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, postJson } from "#/models/utils/http.ts";

import type { ReviewRunData, ReviewRunsData } from "./reviewRuns.data.ts";

export const ReviewRunsModel = createModel((wsId: string, path: string, data?: ReviewRunsData) => {
  const runs = signal<readonly ReviewRunData[]>(data ?? []);

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

  async function submit(): Promise<ReviewRunData | undefined> {
    const result = await runSubmit(async () =>
      postJson<ReviewRunData>("/api/workspaces/files/review", { wsId, path }),
    );
    if (result !== undefined) {
      void load();
    }
    return result;
  }

  return { runs, loading, error, historyLoading, historyError, load, submit };
});

export type ReviewRuns = InstanceType<typeof ReviewRunsModel>;
