import type { FileVersion } from "@essayist/core";
import { createModel, effect, signal, untracked } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import type { FileKey } from "@/signals/file.ts";
import { getFile } from "@/signals/file.ts";
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

  // Refetch when the live file gains a new version, so the picker stays
  // current after writes. untracked: refresh()'s runner state writes must
  // not re-trigger.
  if (IS_BROWSER) {
    const file = getFile(wsId, path);
    effect(() => {
      const latest = file.checkpoint.value?.version_id;
      if (!latest) return;
      if (versions.value.at(-1)?.version_id === latest) return;
      untracked(() => void refresh());
    });
  }

  return { versions, loading, error, refresh };
});

export function getVersionHistory(wsId: string, path: string) {
  return get(
    versionHistoryNs,
    { wsId, path },
    () => new VersionHistoryModel({ wsId, path }),
  );
}
