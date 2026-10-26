import { computed, createModel, type Signal, signal } from "@preact/signals";
import { type FileMarks, FileMarksModel } from "./fileMarks.ts";
import type { MarksData } from "./marks.data.ts";

export const FileMarksByPathModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    selectedVersionId: Signal<string | null>,
    data?: MarksData,
  ) => {
    const byVersion = signal(
      new Map<string, Map<string, Map<string, FileMarks>>>(),
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
      byVersion.value = new Map([
        [
          wsId,
          new Map([
            [
              path,
              new Map([
                [versionId, new FileMarksModel(wsId, path, versionId, data)],
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
      return byVersion.value
        .getOrInsertComputed(wsId, () => new Map())
        .getOrInsertComputed(path, () => new Map())
        .getOrInsertComputed(
          versionId,
          () => new FileMarksModel(wsId, path, versionId),
        );
    });

    return { current };
  },
);

export type FileMarksByPath = InstanceType<typeof FileMarksByPathModel>;
