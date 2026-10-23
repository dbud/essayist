import type { DraftSnapshot, FileSnapshot } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import type { EditorState } from "lexical";
import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, putJson } from "#/models/utils/http.ts";
import {
  editorStateToMarkdown,
  markdownToEditorState,
} from "#/utils/markdown.ts";
import type { FileContentData } from "./fileContent.data.ts";

export type { FileContentData };

export interface FileKey {
  wsId: string;
  path: string;
  versionId?: string;
}

export const FileContentModel = createModel(
  (wsId: string, path: string, data?: FileContentData) => {
    const version = signal<FileSnapshot | null>(data?.version ?? null);
    const draft = signal<DraftSnapshot | null>(data?.draft ?? null);

    const initialContent = computed(
      () => draft.value?.content ?? version.value?.content ?? null,
    );
    const initialState = computed(() =>
      initialContent.value === null
        ? null
        : markdownToEditorState(initialContent.value),
    );
    const modifiedState = signal<EditorState | null>(null);

    function setModifiedState(state: EditorState): void {
      modifiedState.value = state;
    }

    const state = computed(() => modifiedState.value ?? initialState.value);

    const markdown = computed(() =>
      state.value ? editorStateToMarkdown(state.value) : "",
    );

    const dirty = computed(
      () =>
        modifiedState.value !== null &&
        markdown.value !== (initialContent.value ?? ""),
    );

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path });
      const data = await runLoad(async () =>
        getJson<FileContentData>(`/api/workspaces/files/content?${params}`),
      );
      if (data) {
        version.value = data.version;
        draft.value = data.draft;
      }
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    const [runSave, { loading: saving, error: saveError }] = createAsyncState();

    async function save(options?: {
      readonly keepalive?: boolean;
    }): Promise<void> {
      if (!dirty.value) return;
      const result = await runSave(async () =>
        putJson<DraftSnapshot>(
          "/api/workspaces/files/draft",
          { wsId, path, content: markdown.value },
          { keepalive: options?.keepalive },
        ),
      );
      if (result) draft.value = result;
    }

    return {
      version,
      draft,
      initialState,
      modifiedState,
      setModifiedState,
      state,
      markdown,
      dirty,
      save,
      saving,
      saveError,
      load,
      loading,
      error,
    };
  },
);

export type FileContent = InstanceType<typeof FileContentModel>;
