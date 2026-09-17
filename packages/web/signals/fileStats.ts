import { computed, createModel } from "@preact/signals";
import type { FileKey } from "@/signals/file.ts";
import { getFile } from "@/signals/file.ts";
import {
  editorStateCharCount,
  editorStateCharCountWithSpaces,
  editorStateWordCount,
} from "@/utils/textStats.ts";

// Per-file stats derived from the file's editor state.
export const FileStatsModel = createModel((key: FileKey) => {
  const { wsId, path, versionId } = key;
  const file = getFile(wsId, path, versionId);

  const wordCount = computed(() => {
    const state = file.state.value;
    return state ? editorStateWordCount(state) : 0;
  });

  const charCount = computed(() => {
    const state = file.state.value;
    return state ? editorStateCharCount(state) : 0;
  });

  const charCountWithSpaces = computed(() => {
    const state = file.state.value;
    return state ? editorStateCharCountWithSpaces(state) : 0;
  });

  return { wordCount, charCount, charCountWithSpaces };
});

const cache = new Map<string, InstanceType<typeof FileStatsModel>>();

export function getFileStats(wsId: string, path: string, versionId?: string) {
  return cache.getOrInsertComputed(
    `${wsId}:${path}:${versionId ?? ""}`,
    () => new FileStatsModel({ wsId, path, versionId }),
  );
}
