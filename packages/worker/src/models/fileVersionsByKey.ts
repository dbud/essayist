import { computed, createModel, type ReadonlySignal, signal } from "@preact/signals";

import { PENDING_VERSION_ID } from "./fileContent.ts";
import { FileKey, type FileSelection } from "./fileSelection.ts";
import type { FileVersionsData } from "./fileVersions.data.ts";
import { type FileVersions, FileVersionsModel } from "./fileVersions.ts";

export const FileVersionsByKeyModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: FileVersionsData) => {
    const versions = signal(new Map<string, FileVersions>());

    {
      const selection = selected.value;
      if (data !== undefined && selection !== null && selection.fileId !== null) {
        versions.value = new Map([
          [FileKey.cacheKey(selection), new FileVersionsModel(selection, data)],
        ]);
      }
    }

    const current = computed(() => {
      const selection = selected.value;
      if (
        selection === null ||
        selection.fileId === null ||
        selection.versionId === PENDING_VERSION_ID
      ) {
        return null;
      }
      return versions.value.getOrInsertComputed(
        FileKey.cacheKey(selection),
        () => new FileVersionsModel(selection),
      );
    });

    return { current };
  },
);

export type FileVersionsByKey = InstanceType<typeof FileVersionsByKeyModel>;
