import { computed, createModel } from "@preact/signals";
import type { FileContent } from "#/models/fileContent.ts";
import {
  editorStateCharCount,
  editorStateCharCountWithSpaces,
  editorStateWordCount,
} from "#/utils/textStats.ts";

// Per-file stats derived from the editor state of the file.
export const FileStatsModel = createModel((file: FileContent) => {
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
