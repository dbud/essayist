import { computed, createModel, type ReadonlySignal, signal } from "@preact/signals";

import type { FileContentData } from "./fileContent.data.ts";
import { type FileContent, FileContentModel } from "./fileContent.ts";
import { FileKey, type FileSelection } from "./fileSelection.ts";

export const FileContentsModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: FileContentData) => {
    const files = signal(new Map<string, FileContent>());

    {
      const selection = selected.value;
      if (data !== undefined && selection !== null && selection.path !== null) {
        files.value = new Map([
          [FileKey.cacheKey(selection), new FileContentModel(selection, data)],
        ]);
      }
    }

    const current = computed(() => {
      const selection = selected.value;
      if (selection === null || selection.path === null) return null;
      return files.value.getOrInsertComputed(
        FileKey.cacheKey(selection),
        () => new FileContentModel(selection),
      );
    });

    return { current };
  },
);

export type FileContents = InstanceType<typeof FileContentsModel>;
