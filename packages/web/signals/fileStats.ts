import { computed, createModel } from "@preact/signals";
import { getFile } from "@/signals/file.ts";
import {
  editorStateCharCount,
  editorStateCharCountWithSpaces,
  editorStateWordCount,
} from "@/utils/textStats.ts";

// Per-file stats derived from the file's editor state.
export const FileStatsModel = createModel((wsId: string, path: string) => {
  const file = getFile(wsId, path);

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

export function getFileStats(wsId: string, path: string) {
  const key = `${wsId}:${path}`;
  return cache.getOrInsertComputed(key, () => new FileStatsModel(wsId, path));
}
