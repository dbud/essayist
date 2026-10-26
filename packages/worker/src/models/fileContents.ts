import { computed, createModel, type Signal, signal } from "@preact/signals";
import type { FileContentData } from "./fileContent.data.ts";
import { type FileContent, FileContentModel } from "./fileContent.ts";

export const FileContentsModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    selectedVersionId: Signal<string | null>,
    data?: FileContentData,
  ) => {
    const files = signal(
      new Map<string, Map<string, Map<string, FileContent>>>(),
    );

    const wsId = selectedWorkspaceId.value;
    const path = selectedPath.value;
    const versionId = selectedVersionId.value;
    if (
      data !== undefined &&
      wsId !== null &&
      path !== null &&
      versionId !== null
    ) {
      files.value = new Map([
        [
          wsId,
          new Map([
            [
              path,
              new Map([
                [versionId, new FileContentModel(wsId, path, versionId, data)],
              ]),
            ],
          ]),
        ],
      ]);
    }

    const current = computed(() => {
      const wsId = selectedWorkspaceId.value;
      const path = selectedPath.value;
      const versionId = selectedVersionId.value;
      if (wsId === null || path === null || versionId === null) return null;
      return files.value
        .getOrInsertComputed(wsId, () => new Map())
        .getOrInsertComputed(path, () => new Map())
        .getOrInsertComputed(
          versionId,
          () => new FileContentModel(wsId, path, versionId),
        );
    });

    return { current };
  },
);

export type FileContents = InstanceType<typeof FileContentsModel>;
