import { computed, createModel } from "@preact/signals";
import { getFile } from "@/signals/file.ts";
import { editorStateWordCount } from "@/utils/wordCount.ts";

// Per-file stats derived from the file's editor state.
export const FileStatsModel = createModel(
  (workspaceId: string, path: string) => {
    const file = getFile(workspaceId, path);

    const wordCount = computed(() => {
      const state = file.state.value;
      return state ? editorStateWordCount(state) : 0;
    });

    return { wordCount };
  },
);

const cache = new Map<string, InstanceType<typeof FileStatsModel>>();

export function getFileStats(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new FileStatsModel(workspaceId, path),
  );
}
