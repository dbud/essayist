import {
  computed,
  createModel,
  type ReadonlySignal,
  signal,
} from "@preact/signals";
import { type FileMarks, FileMarksModel } from "./fileMarks.ts";
import { FileKey, type FileSelection } from "./fileSelection.ts";
import type { MarksData } from "./marks.data.ts";

export const FileMarksByPathModel = createModel(
  (selected: ReadonlySignal<FileSelection | null>, data?: MarksData) => {
    const marks = signal(new Map<string, FileMarks>());

    const selection = selected.value;
    if (data !== undefined && selection !== null && selection.path !== null) {
      marks.value = new Map([
        [FileKey.cacheKey(selection), new FileMarksModel(selection, data)],
      ]);
    }

    const current = computed(() => {
      const selection = selected.value;
      if (selection === null || selection.path === null) return null;
      return marks.value.getOrInsertComputed(
        FileKey.cacheKey(selection),
        () => new FileMarksModel(selection),
      );
    });

    return { current };
  },
);

export type FileMarksByPath = InstanceType<typeof FileMarksByPathModel>;
