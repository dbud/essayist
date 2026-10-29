import { computed, createModel, effect, type ReadonlySignal, signal } from "@preact/signals";

import type { FileContentData } from "./fileContent.data.ts";
import { type FileContent, FileContentModel, PENDING_VERSION_ID } from "./fileContent.ts";
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

    if (!import.meta.env.SSR) {
      // The pending version's editor state moves to the created version.
      effect(() => {
        const selection = selected.value;
        if (
          selection === null ||
          selection.path === null ||
          selection.versionId === PENDING_VERSION_ID
        ) {
          return;
        }
        const pending = files
          .peek()
          .get(FileKey.cacheKey({ ...selection, versionId: PENDING_VERSION_ID }));
        if (pending === undefined) return;
        const model = current.value;
        if (model === null) return;
        const editorState = pending.state.peek();
        if (editorState !== null) {
          model.setModifiedState(editorState);
        }
        files.peek().delete(FileKey.cacheKey({ ...selection, versionId: PENDING_VERSION_ID }));
      });
    }

    return { current };
  },
);

export type FileContents = InstanceType<typeof FileContentsModel>;
