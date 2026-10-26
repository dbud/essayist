import { computed, createModel, type Signal, signal } from "@preact/signals";
import type { FileContentData } from "./fileContent.data.ts";
import { type FileContent, FileContentModel } from "./fileContent.ts";

export const FileContentsModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    data?: FileContentData,
  ) => {
    const files = signal(new Map<string, Map<string, FileContent>>());

    const wsId = selectedWorkspaceId.value;
    const path = selectedPath.value;
    if (data !== undefined && wsId !== null && path !== null) {
      files.value = new Map([
        [wsId, new Map([[path, new FileContentModel(wsId, path, data)]])],
      ]);
    }

    const current = computed(() => {
      const wsId = selectedWorkspaceId.value;
      const path = selectedPath.value;
      if (wsId === null || path === null) return null;
      return files.value
        .getOrInsertComputed(wsId, () => new Map())
        .getOrInsertComputed(path, () => new FileContentModel(wsId, path));
    });

    return { current };
  },
);

export type FileContents = InstanceType<typeof FileContentsModel>;
