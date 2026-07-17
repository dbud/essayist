import type { FileSnapshot } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import type { EditorState } from "lexical";
import {
  buildTextNodeSpans,
  findRange,
  type Span,
} from "@/editor/textNodeSpans.ts";
import { openedFiles } from "@/signals/openedFiles.ts";
import { onWorkspaceChange, workspaces } from "@/signals/workspace.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import {
  editorStateToMarkdown,
  markdownToEditorState,
} from "@/utils/markdown.ts";

export const FileModel = createModel((path: string) => {
  const snapshot = signal<FileSnapshot | null>(null);
  const [run, { loading, error }] = createAsyncState();
  const isSelected = computed(() => path === openedFiles.selected.value);

  const initialState = computed(() =>
    snapshot.value ? markdownToEditorState(snapshot.value.content) : null,
  );
  const content = computed(() => snapshot.value?.content ?? "");

  const modifiedState = signal<EditorState | null>(null);
  function setModifiedState(state: EditorState) {
    modifiedState.value = state;
  }

  const state = computed(() => modifiedState.value ?? initialState.value);

  const markdown = computed(() => {
    if (!state.value) return "";
    return editorStateToMarkdown(state.value);
  });

  const initialMarkdown = computed(() => {
    if (!initialState.value) return "";
    return editorStateToMarkdown(initialState.value);
  });

  const dirty = computed(
    () =>
      modifiedState.value !== null && markdown.value !== initialMarkdown.value,
  );

  const textNodeSpans = deepComputed(() => {
    if (!state.value) return [];
    return buildTextNodeSpans(state.value, markdown.value);
  });
  function getNodeRange(span: Span) {
    return findRange(textNodeSpans.value, span);
  }

  async function load() {
    const wsId = workspaces.currentWorkspaceId.value;
    if (!wsId) return;
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(wsId)}/files/${encodeURIComponent(path)}`,
      );
      return (await res.json()) as FileSnapshot;
    });
    if (result) snapshot.value = result;
  }

  onWorkspaceChange(load);

  return {
    snapshot,
    content,
    initialState,
    state,
    setModifiedState,
    loading,
    error,
    markdown,
    dirty,
    isSelected,
    textNodeSpans,
    getNodeRange,
  };
});

const fileMap = new Map<string, InstanceType<typeof FileModel>>();

export function useFile(path: string) {
  return fileMap.getOrInsertComputed(path, () => new FileModel(path));
}
