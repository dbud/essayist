import { computed, createModel, type Signal, signal } from "@preact/signals";
import type { FileVersionsData } from "./fileVersions.data.ts";
import { type FileVersions, FileVersionsModel } from "./fileVersions.ts";

export const FileVersionsByPathModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    data?: FileVersionsData,
  ) => {
    const versions = signal(new Map<string, Map<string, FileVersions>>());

    const wsId = selectedWorkspaceId.value;
    const path = selectedPath.value;
    if (data !== undefined && wsId !== null && path !== null) {
      versions.value = new Map([
        [wsId, new Map([[path, new FileVersionsModel(wsId, path, data)]])],
      ]);
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
