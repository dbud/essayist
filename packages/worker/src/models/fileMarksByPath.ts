import { computed, createModel, type Signal } from "@preact/signals";
import { type FileMarks, FileMarksModel } from "./fileMarks.ts";

export const FileMarksByPathModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    selectedVersionId: Signal<string | null>,
  ) => {
    const byVersion = new Map<string, Map<string, Map<string, FileMarks>>>();

    const current = computed(() => {
      const wsId = selectedWorkspaceId.value;
      const path = selectedPath.value;
      const versionId = selectedVersionId.value;
      if (wsId === null || path === null || versionId === null) return null;
      return byVersion
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
