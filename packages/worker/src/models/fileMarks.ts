import type { Mark } from "@essayist/core";
import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";

import type { FileKey } from "./fileSelection.ts";
import type { MarksData } from "./marks.data.ts";

export const FileMarksModel = createModel(
  ({ wsId, path, versionId }: FileKey, data?: MarksData) => {
    const marks = signal<readonly Mark[]>(data ?? []);

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path, versionId });
      const fresh = await runLoad(async () =>
        getJson<MarksData>(`/api/workspaces/files/marks?${params}`),
      );
      if (fresh) marks.value = fresh;
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    return { marks, load, loading, error };
  },
);

export type FileMarks = InstanceType<typeof FileMarksModel>;
