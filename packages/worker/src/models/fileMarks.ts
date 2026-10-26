import type { Mark } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";
import type { MarksData } from "./marks.data.ts";

export type { MarksData };

export const FileMarksModel = createModel(
  (wsId: string, path: string, versionId: string, data?: MarksData) => {
    const marks = signal<readonly Mark[]>(data?.marks ?? []);

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path, versionId });
      const data = await runLoad(async () =>
        getJson<MarksData>(`/api/workspaces/files/marks?${params}`),
      );
      if (data) marks.value = data.marks;
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    return { marks, load, loading, error };
  },
);

export type FileMarks = InstanceType<typeof FileMarksModel>;
