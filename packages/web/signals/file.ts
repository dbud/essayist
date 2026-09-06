import type { FileSnapshot, WriteResult } from "@essayist/core";
import {
  computed,
  createModel,
  effect,
  type Signal,
  signal,
} from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import type { EditorState } from "lexical";
import { getOpenedFilesFor } from "@/signals/openedFiles.ts";
import { autoSave } from "@/signals/preferences.ts";
import { dismissToast, showToast, type Toast } from "@/signals/toast.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import {
  editorStateToMarkdown,
  markdownToEditorState,
} from "@/utils/markdown.ts";

const AUTO_SAVE_IDLE_MS = 2000;
const AUTO_SAVE_MAX_WAIT_MS = 30000;

export const FileModel = createModel((workspaceId: string, path: string) => {
  const snapshot = signal<FileSnapshot | null>(null);
  const [run, { loading, error }] = createAsyncState(true);
  const [runSave, { loading: saving, error: saveError }] = createAsyncState();
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

  let nextCheckpoint: number | null = null;
  let failureToast: Signal<Toast> | null = null;

  async function load() {
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
      );
      await ensureOk(res);
      return (await res.json()) as FileSnapshot;
    });
    if (result) snapshot.value = result;
  }

  async function save(): Promise<boolean> {
    if (!dirty.value) return true;
    const content = markdown.value;
    nextCheckpoint = Date.now() + AUTO_SAVE_MAX_WAIT_MS;

    const result = await runSave(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      await ensureOk(res);
      return (await res.json()) as WriteResult;
    });

    if (result === undefined) return false;

    if (failureToast) {
      dismissToast(failureToast);
      failureToast = null;
    }
    snapshot.value = { ...result, content };
    return true;
  }

  if (IS_BROWSER) {
    void load();

    // Idle debounce: save once edits pause.
    effect(() => {
      if (!autoSave.value || !dirty.value) return;
      void markdown.value;
      const t = setTimeout(save, AUTO_SAVE_IDLE_MS);
      return () => clearTimeout(t);
    });

    // Max wait: while continuously dirty, checkpoint at most this often so
    // a no-pause burst still saves.
    effect(() => {
      if (!autoSave.value || !dirty.value) {
        nextCheckpoint = null;
        return;
      }
      void markdown.value;
      if (nextCheckpoint === null) {
        nextCheckpoint = Date.now() + AUTO_SAVE_MAX_WAIT_MS;
      }
      const t = setTimeout(save, Math.max(0, nextCheckpoint - Date.now()));
      return () => clearTimeout(t);
    });

    // Failed saves surface as an error toast, updated in place on repeat
    // failures.
    effect(() => {
      const message = saveError.value;
      if (!message) return;
      if (failureToast) {
        failureToast.value = { ...failureToast.value, message };
      } else {
        failureToast = showToast(message, "error");
      }
    });
  }

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
    save,
    saving,
    saveError,
  };
});

const cache = new Map<string, InstanceType<typeof FileModel>>();

export function getFile(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(key, () => new FileModel(workspaceId, path));
}
