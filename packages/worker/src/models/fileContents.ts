import { computed, createModel, type Signal, signal } from "@preact/signals";
import { type FileContent, FileContentModel } from "./fileContent.ts";
import type { FileContentsData } from "./fileContents.data.ts";

export const FileContentsModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    data: FileContentsData,
  ) => {
    const files = signal(new Map<string, Map<string, FileContent>>());

    if (data.wsId !== null && data.path !== null && data.content !== null) {
      const file = new FileContentModel(data.wsId, data.path, data.content);
      files.value = new Map([[data.wsId, new Map([[data.path, file]])]]);
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
