import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";

import type { FileKey } from "./fileSelection.ts";
import type { LatestReviewData } from "./marks.data.ts";

/** The review a version of a file shows, with its marks; null before the first review. */
export const FileReviewModel = createModel(
  ({ wsId, path, versionId }: FileKey, data?: LatestReviewData) => {
    const latest = signal<LatestReviewData>(data ?? null);

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path, versionId });
      const fresh = await runLoad(async () =>
        getJson<LatestReviewData>(`/api/workspaces/files/review?${params}`),
      );
      if (fresh !== undefined) latest.value = fresh;
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    return { latest, load, loading, error };
  },
);

export type FileReview = InstanceType<typeof FileReviewModel>;
