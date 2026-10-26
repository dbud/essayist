import {
  computed,
  createModel,
  type ReadonlySignal,
  signal,
} from "@preact/signals";
import type { FileContentData } from "./fileContent.data.ts";
import { type FileContent, FileContentModel } from "./fileContent.ts";
import type { FileSelection } from "./fileSelection.ts";

export const FileContentsModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: FileContentData) => {
    const files = signal(
      new Map<string, Map<string, Map<string, FileContent>>>(),
    );

    const selection = selected.value;
    if (data !== undefined && selection?.path) {
      const { wsId, path, versionId } = selection;
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
      const selection = selected.value;
      if (selection === null || selection.path === null) return null;
      const { wsId, path, versionId } = selection;
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
