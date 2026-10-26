import {
  computed,
  createModel,
  type ReadonlySignal,
  signal,
} from "@preact/signals";
import type { FileSelection } from "./fileSelection.ts";
import type { FileVersionsData } from "./fileVersions.data.ts";
import { type FileVersions, FileVersionsModel } from "./fileVersions.ts";

export const FileVersionsByPathModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: FileVersionsData) => {
    const versions = signal(new Map<string, Map<string, FileVersions>>());

    const selection = selected.value;
    if (data !== undefined && selection?.path) {
      const { wsId, path } = selection;
      versions.value = new Map([
        [wsId, new Map([[path, new FileVersionsModel(wsId, path, data)]])],
      ]);
    }

    const current = computed(() => {
      const selection = selected.value;
      if (selection === null || selection.path === null) return null;
      const { wsId, path } = selection;
      return versions.value
        .getOrInsertComputed(wsId, () => new Map())
        .getOrInsertComputed(path, () => new FileVersionsModel(wsId, path));
    });

    return { current };
  },
);

export type FileVersionsByPath = InstanceType<typeof FileVersionsByPathModel>;
