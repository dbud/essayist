import { computed, createModel, effect, type ReadonlySignal, signal } from "@preact/signals";

import type { FileContentData } from "./fileContent.data.ts";
import { type FileContent, FileContentModel, PENDING_VERSION_ID } from "./fileContent.ts";
import { type FileSelection, VersionKey } from "./fileSelection.ts";
import type { FileTrees } from "./fileTrees.ts";

export const FileContentsModel = createModel(
  (
    selected: ReadonlySignal<FileSelection | null>,
    fileTrees: Pick<FileTrees, "get">,
    data?: FileContentData,
  ) => {
    const files = signal(new Map<string, FileContent>());

    {
      const selection = selected.value;
      if (data !== undefined && selection !== null && selection.fileId !== null) {
        files.value = new Map([
          [
            VersionKey.cacheKey(selection),
            new FileContentModel(selection, fileTrees.get(selection.wsId), data),
          ],
        ]);
      }
    }

    const current = computed(() => {
      const selection = selected.value;
      if (selection === null || selection.fileId === null) return null;
      return files.value.getOrInsertComputed(
        VersionKey.cacheKey(selection),
        () => new FileContentModel(selection, fileTrees.get(selection.wsId)),
      );
    });

    const anyDirty = computed(() => files.value.values().some((file) => file.dirty.value));

    if (!import.meta.env.SSR) {
      // The pending version's editor state moves to the created version.
      effect(() => {
        const selection = selected.value;
        if (
          selection === null ||
          selection.fileId === null ||
          selection.versionId === PENDING_VERSION_ID
        ) {
          return;
        }
        const pendingKey = VersionKey.cacheKey({ ...selection, versionId: PENDING_VERSION_ID });
        const pending = files.peek().get(pendingKey);
        if (pending === undefined) return;
        const model = current.value;
        if (model === null) return;
        const editorState = pending.state.peek();
        if (editorState !== null) {
          model.setModifiedState(editorState);
        }
        files.peek().delete(pendingKey);
      });
    }

    return { current, anyDirty };
  },
);

export type FileContents = InstanceType<typeof FileContentsModel>;
