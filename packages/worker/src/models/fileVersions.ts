import { createModel, signal } from "@preact/signals";
import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";
import type { FileVersionsData } from "./fileVersions.data.ts";

export type { FileVersionsData };

export const FileVersionsModel = createModel(
  (wsId: string, path: string, data?: FileVersionsData) => {
    const versions = signal<FileVersionsData>(data ?? []);

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path });
      const data = await runLoad(async () =>
        getJson<FileVersionsData>(`/api/workspaces/files/versions?${params}`),
      );
      if (data) versions.value = data;
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    return { versions, load, loading, error };
  },
);

export type FileVersions = InstanceType<typeof FileVersionsModel>;
