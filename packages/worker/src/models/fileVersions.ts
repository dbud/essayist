import { createModel, signal } from "@preact/signals";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson } from "#/models/utils/http.ts";

import type { FileKey } from "./fileSelection.ts";
import type { FileVersionData, FileVersionsData } from "./fileVersions.data.ts";

export const FileVersionsModel = createModel(
  ({ wsId, fileId }: FileKey, data?: FileVersionsData) => {
    const versions = signal<readonly FileVersionData[]>(data ?? []);

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, fileId });
      const fresh = await runLoad(async () =>
        getJson<FileVersionsData>(`/api/workspaces/files/versions?${params}`),
      );
      if (fresh) versions.value = fresh;
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    function byId(versionId: string | null): FileVersionData | null {
      return versionId === null
        ? null
        : (versions.value.find((version) => version.id === versionId) ?? null);
    }

    return { versions, byId, load, loading, error };
  },
);

export type FileVersions = InstanceType<typeof FileVersionsModel>;
