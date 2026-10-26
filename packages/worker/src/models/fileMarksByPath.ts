import { computed, createModel, type Signal } from "@preact/signals";
import { type FileMarks, FileMarksModel } from "./fileMarks.ts";
import type { FileMarksByPathData } from "./fileMarksByPath.data.ts";

export const FileMarksByPathModel = createModel(
  (
    selectedWorkspaceId: Signal<string | null>,
    selectedPath: Signal<string | null>,
    selectedVersionId: Signal<string | null>,
    data?: FileMarksByPathData,
  ) => {
    const byVersion = new Map<string, Map<string, Map<string, FileMarks>>>();

    if (
      data !== undefined &&
      data.wsId !== null &&
      data.path !== null &&
      data.versionId !== null &&
      data.marks !== null
    ) {
      byVersion.set(
        data.wsId,
        new Map([
          [
            data.path,
            new Map([
              [
                data.versionId,
                new FileMarksModel(data.wsId, data.path, data.versionId, {
                  marks: data.marks,
                }),
              ],
            ]),
          ],
        ]),
      );
    }

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
