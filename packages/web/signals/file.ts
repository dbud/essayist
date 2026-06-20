import type { FileSnapshot } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import type { EditorState } from "lexical";
import { openedFiles } from "@/signals/openedFiles.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { markdownToEditorState } from "@/utils/markdown.ts";

export const FileModel = createModel((path: string) => {
  const content = signal<FileSnapshot | null>(null);
  const [run, { loading, error }] = createAsyncState();
  const isSelected = computed(() => path === openedFiles.selected.value);

  const initialState = computed(() =>
    content.value ? markdownToEditorState(content.value.content) : null,
  );

  const modifiedState = signal<EditorState | null>(null);
  function setModifiedState(state: EditorState) {
    modifiedState.value = state;
  }

  const dirty = computed(
    () =>
      modifiedState.value !== null &&
      JSON.stringify(initialState.value) !==
        JSON.stringify(modifiedState.value),
  );

  const state = computed(() => modifiedState.value ?? initialState.value);

  async function load() {
    const result = await run(async () => {
      const res = await fetch(`/api/files/${encodeURIComponent(path)}`);
      return (await res.json()) as FileSnapshot;
    });
    if (result) content.value = result;
  }

  load();

  return {
    content,
    initialState,
    state,
    setModifiedState,
    loading,
    error,
    dirty,
    isSelected,
  };
});

const fileMap = new Map<string, InstanceType<typeof FileModel>>();

export function useFile(path: string) {
  return fileMap.getOrInsertComputed(path, () => new FileModel(path));
}
