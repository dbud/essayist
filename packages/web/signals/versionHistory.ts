import type { FileVersion } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import type { FileKey } from "@/signals/file.ts";
import { get, modelData, namespace } from "@/signals/models.ts";
import { ensureOk } from "@/utils/ensureOk.ts";

export interface VersionHistoryData {
  versions: FileVersion[];
}

export const versionHistoryNs = namespace<VersionHistoryData, FileKey>(
  "versionHistory",
);

export const VersionHistoryModel = createModel((key: FileKey) => {
  const { wsId, path } = key;
  const versions = signal<FileVersion[]>([]);

  const { loading, error, refresh } = modelData(
    versionHistoryNs,
    { wsId, path },
    (data) => (versions.value = data.versions),
    async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(wsId)}/files/${encodeURIComponent(path)}/versions`,
      );
      await ensureOk(res);
      return (await res.json()) as VersionHistoryData;
    },
  );

  return { versions, loading, error, refresh };
});

export function getVersionHistory(wsId: string, path: string) {
  return get(
    versionHistoryNs,
    { wsId, path },
    () => new VersionHistoryModel({ wsId, path }),
  );
}
