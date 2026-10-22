import { computed, createModel, type Signal, signal } from "@preact/signals";
import { type FileVersions, FileVersionsModel } from "./fileVersions.ts";
import type { FileVersionsByPathData } from "./fileVersionsByPath.data.ts";

export const FileVersionsByPathModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    data: FileVersionsByPathData,
  ) => {
    const versions = signal(new Map<string, Map<string, FileVersions>>());

    if (data.wsId !== null && data.path !== null && data.versions !== null) {
      const file = new FileVersionsModel(data.wsId, data.path, data.versions);
      versions.value = new Map([[data.wsId, new Map([[data.path, file]])]]);
    }

    const current = computed(() => {
      const wsId = selectedWorkspaceId.value;
      const path = selectedPath.value;
      if (wsId === null || path === null) return null;
      return versions.value
        .getOrInsertComputed(wsId, () => new Map())
        .getOrInsertComputed(path, () => new FileVersionsModel(wsId, path));
    });

    return { current };
  },
);

export type FileVersionsByPath = InstanceType<typeof FileVersionsByPathModel>;
