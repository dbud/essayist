import type { FileSnapshot } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import type { EditorState } from "lexical";
import {
  buildTextNodeSpans,
  findRange,
  type Span,
} from "@/editor/textNodeSpans.ts";
import { getOpenedFilesFor } from "@/signals/openedFiles.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import {
  editorStateToMarkdown,
  markdownToEditorState,
} from "@/utils/markdown.ts";

export const FileModel = createModel((workspaceId: string, path: string) => {
  const snapshot = signal<FileSnapshot | null>(null);
  const [run, { loading, error }] = createAsyncState(true);
  const isSelected = computed(
    () => getOpenedFilesFor(workspaceId).selected.value === path,
  );

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
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as FileSnapshot;
    });
    if (result) snapshot.value = result;
  }

  if (IS_BROWSER) void load();

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

const cache = new Map<string, InstanceType<typeof FileModel>>();

export function getFile(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(key, () => new FileModel(workspaceId, path));
}
