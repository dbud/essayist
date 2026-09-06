import type { DraftSnapshot, FileSnapshot } from "@essayist/core";
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
  // Latest promoted version; marks anchor to its content.
  const checkpoint = signal<FileSnapshot | null>(null);
  const draft = signal<DraftSnapshot | null>(null);
  const [run, { loading, error }] = createAsyncState(true);
  const [runSave, { loading: saving, error: saveError }] = createAsyncState();
  const isSelected = computed(
    () => getOpenedFilesFor(workspaceId).selected.value === path,
  );

  // Editor seed, parsed once; autosave adopts strings without re-parsing.
  const seedContent = signal<string | null>(null);
  const initialState = computed(() =>
    seedContent.value ? markdownToEditorState(seedContent.value) : null,
  );

  const modifiedState = signal<EditorState | null>(null);
  function setModifiedState(state: EditorState) {
    modifiedState.value = state;
  }

  const state = computed(() => modifiedState.value ?? initialState.value);

  const markdown = computed(() => {
    if (!state.value) return "";
    return editorStateToMarkdown(state.value);
  });

  const checkpointContent = computed(() => checkpoint.value?.content ?? "");

  const dirty = computed(
    () =>
      modifiedState.value !== null &&
      markdown.value !==
        (draft.value?.content ?? checkpoint.value?.content ?? ""),
  );

  let nextSaveAt: number | null = null;
  let failureToast: Signal<Toast> | null = null;

  async function load() {
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
      );
      await ensureOk(res);
      return (await res.json()) as {
        checkpoint: FileSnapshot;
        draft: DraftSnapshot | null;
      };
    });
    if (!result) return;
    checkpoint.value = result.checkpoint;
    draft.value = result.draft;
    seedContent.value = result.draft?.content ?? result.checkpoint.content;
  }

  async function save(): Promise<boolean> {
    if (!dirty.value) return true;
    const content = markdown.value;
    nextSaveAt = Date.now() + AUTO_SAVE_MAX_WAIT_MS;

    const result = await runSave(async () => {
      const res = await putDraft(content);
      await ensureOk(res);
      return (await res.json()) as { timestamp: number };
    });

    if (result === undefined) return false;

    if (failureToast) {
      dismissToast(failureToast);
      failureToast = null;
    }
    draft.value = { ...result, content };
    return true;
  }

  function putDraft(
    content: string,
    { keepalive = false }: { keepalive?: boolean } = {},
  ): Promise<Response> {
    return fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        keepalive,
      },
    );
  }

  function flush() {
    if (!dirty.value) return;
    void putDraft(markdown.value, { keepalive: true }).catch(() => {});
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

    // Max wait: while continuously dirty, save at most this often.
    effect(() => {
      if (!autoSave.value || !dirty.value) {
        nextSaveAt = null;
        return;
      }
      void markdown.value;
      if (nextSaveAt === null) {
        nextSaveAt = Date.now() + AUTO_SAVE_MAX_WAIT_MS;
      }
      const t = setTimeout(save, Math.max(0, nextSaveAt - Date.now()));
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
    checkpoint,
    draft,
    checkpointContent,
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
    flush,
  };
});

const cache = new Map<string, InstanceType<typeof FileModel>>();

export function getFile(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(key, () => new FileModel(workspaceId, path));
}

export function flushAllDirty(): void {
  for (const model of cache.values()) model.flush();
}

export function anyFileDirty(): boolean {
  return [...cache.values()].some((model) => model.dirty.value);
}
