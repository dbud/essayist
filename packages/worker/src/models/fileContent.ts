import type { DraftSnapshot, FileSnapshot } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, putJson } from "#/models/utils/http.ts";
import type { FileContentData } from "./fileContent.data.ts";

export type { FileContentData };

// TODO -- ESS-84: autosave and version views when the editor and history land
export const FileContentModel = createModel(
  (wsId: string, path: string, data?: FileContentData) => {
    const version = signal<FileSnapshot | null>(data?.version ?? null);
    const draft = signal<DraftSnapshot | null>(data?.draft ?? null);
    const content = signal<string | null>(
      data?.draft?.content ?? data?.version.content ?? null,
    );

    const dirty = computed(() => {
      const text = content.value;
      return (
        text !== null &&
        text !== (draft.value?.content ?? version.value?.content ?? null)
      );
    });

    const [runLoad, { loading, error }] = createAsyncState();

    async function load(): Promise<void> {
      const params = new URLSearchParams({ wsId, path });
      const data = await runLoad(async () =>
        getJson<FileContentData>(`/api/workspaces/files/content?${params}`),
      );
      if (data) {
        version.value = data.version;
        draft.value = data.draft;
        content.value = data.draft?.content ?? data.version.content;
      }
    }

    if (data === undefined && !import.meta.env.SSR) void load();

    const [runSave, { loading: saving, error: saveError }] = createAsyncState();

    async function save(): Promise<void> {
      const text = content.value;
      if (text === null || !dirty.value) return;
      const result = await runSave(async () =>
        putJson<DraftSnapshot>("/api/workspaces/files/draft", {
          wsId,
          path,
          content: text,
        }),
      );
      if (result) draft.value = result;
    }

    return {
      version,
      draft,
      content,
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
