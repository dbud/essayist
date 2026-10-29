import type { DraftSnapshot, FileSnapshot, FileVersion, WriteResult } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import type { EditorState } from "lexical";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, postJson, putJson, requestJson } from "#/models/utils/http.ts";
import { editorStateToMarkdown, markdownToEditorState } from "#/utils/markdown.ts";

import type { FileContentData } from "./fileContent.data.ts";
import type { FileKey } from "./fileSelection.ts";

export const PENDING_VERSION_ID = "pending";

export const FileContentModel = createModel(
  ({ wsId, path, versionId }: FileKey, data?: FileContentData) => {
    const version = signal<FileSnapshot | null>(data?.version ?? null);
    const draft = signal<DraftSnapshot | null>(data?.draft ?? null);

    const initialContent = computed(() => draft.value?.content ?? version.value?.content ?? null);
    const initialState = computed(() =>
      initialContent.value === null ? null : markdownToEditorState(initialContent.value),
    );
    const modifiedState = signal<EditorState | null>(null);

    function setModifiedState(state: EditorState): void {
      modifiedState.value = state;
    }

    const state = computed(() => modifiedState.value ?? initialState.value);

    const markdown = computed(() => (state.value ? editorStateToMarkdown(state.value) : ""));

    const dirty = computed(
      () => modifiedState.value !== null && markdown.value !== (initialContent.value ?? ""),
    );

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path, versionId });
      const fresh = await runLoad(async () =>
        getJson<FileContentData>(`/api/workspaces/files/content?${params}`),
      );
      if (fresh) {
        version.value = fresh.version;
        draft.value = fresh.draft;
      }
    }

    if (data === undefined) {
      if (versionId === PENDING_VERSION_ID) {
        version.value = { version_id: versionId, timestamp: 0, lines: 0, content: "" };
      } else if (!import.meta.env.SSR) {
        void load();
      }
    }

    const [runSave, { loading: saving, error: saveError }] = createAsyncState();

    async function save(options?: {
      readonly keepalive?: boolean;
    }): Promise<"created" | "saved" | undefined> {
      const content = markdown.value;
      if (!dirty.value) return;
      if (version.value?.version_id === PENDING_VERSION_ID) {
        if (content === "") return;
        return await runSave(async () => {
          const res = await requestJson<WriteResult>(
            "POST",
            "/api/workspaces/files/create",
            { wsId, path, content },
            options,
          );
          if (!res.ok || res.data === undefined) {
            throw new Error(
              res.message ??
                (res.status === 409 ? `${path}: already exists` : `failed (${res.status})`),
            );
          }
          const { version_id, timestamp, lines } = res.data;
          version.value = { version_id, timestamp, lines, content };
          return "created" as const;
        });
      }
      const result = await runSave(async () =>
        putJson<DraftSnapshot>("/api/workspaces/files/draft", { wsId, path, content }, options),
      );
      if (result) {
        draft.value = result;
        return "saved";
      }
    }

    async function promote(): Promise<FileVersion> {
      return postJson<FileVersion>("/api/workspaces/files/promote", {
        wsId,
        path,
      });
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
      promote,
      saving,
      saveError,
      load,
      loading,
      error,
    };
  },
);

export type FileContent = InstanceType<typeof FileContentModel>;
