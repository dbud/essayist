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
import { getFileTreeFor } from "@/signals/fileTree.ts";
import { get, instances, modelData, namespace } from "@/signals/models.ts";
import { autoSave, autoSaveInterval } from "@/signals/preferences.ts";
import { dismissToast, showToast, type Toast } from "@/signals/toast.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import {
  editorStateToMarkdown,
  markdownToEditorState,
} from "@/utils/markdown.ts";

const AUTO_SAVE_MAX_WAIT_MS = 30_000;

export interface FileKey {
  workspaceId: string;
  path: string;
}

export interface FileData {
  checkpoint: FileSnapshot;
  draft: DraftSnapshot | null;
}

export const fileNs = namespace<FileData, FileKey>("file");

export const FileModel = createModel((workspaceId: string, path: string) => {
  // Latest promoted version; marks anchor to its content.
  const checkpoint = signal<FileSnapshot | null>(null);
  const draft = signal<DraftSnapshot | null>(null);
  const [runSave, { loading: saving, error: saveError }] = createAsyncState();
  const isSelected = computed(
    () => getFileTreeFor(workspaceId).selectedPath.value === path,
  );

  // Editor seed, parsed once; autosave adopts strings without re-parsing.
  const seedContent = signal<string | null>(null);
  const initialState = computed(() =>
    seedContent.value === null
      ? null
      : markdownToEditorState(seedContent.value),
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

  const { loading, error } = modelData(
    fileNs,
    { workspaceId, path },
    (data) => {
      checkpoint.value = data.checkpoint;
      draft.value = data.draft;
      seedContent.value = data.draft?.content ?? data.checkpoint.content;
    },
    async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
      );
      await ensureOk(res);
      return (await res.json()) as FileData;
    },
  );

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
    // Idle debounce: save once edits pause.
    effect(() => {
      if (!autoSave.value || !dirty.value) return;
      void markdown.value;
      const t = setTimeout(save, autoSaveInterval.value * 1000);
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
        nextSaveAt =
          Date.now() +
          Math.max(autoSaveInterval.value * 1000, AUTO_SAVE_MAX_WAIT_MS);
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

export type File = InstanceType<typeof FileModel>;

export function getFile(workspaceId: string, path: string): File {
  return get(
    fileNs,
    { workspaceId, path },
    () => new FileModel(workspaceId, path),
  );
}

export function flushAllDirty(): void {
  for (const model of instances<File>(fileNs)) model.flush();
}

export function anyFileDirty(): boolean {
  return instances<File>(fileNs).some((model) => model.dirty.value);
}
