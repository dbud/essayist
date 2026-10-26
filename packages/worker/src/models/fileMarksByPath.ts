import {
  computed,
  createModel,
  type ReadonlySignal,
  signal,
} from "@preact/signals";
import { type FileMarks, FileMarksModel } from "./fileMarks.ts";
import type { FileSelection } from "./fileSelection.ts";
import type { MarksData } from "./marks.data.ts";

export const FileMarksByPathModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: MarksData) => {
    const byVersion = signal(
      new Map<string, Map<string, Map<string, FileMarks>>>(),
    );

    const selection = selected.value;
    if (data !== undefined && selection?.path) {
      const { wsId, path, versionId } = selection;
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
      const selection = selected.value;
      if (selection === null || selection.path === null) return null;
      const { wsId, path, versionId } = selection;
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
