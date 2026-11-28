import { computed, createModel, signal } from "@preact/signals";
import type { EditorState } from "lexical";

import createAsyncState from "#/models/utils/asyncState.ts";
import { getJson, postJson, putJson } from "#/models/utils/http.ts";
import { editorStateToMarkdown, markdownToEditorState } from "#/utils/markdown.ts";

import type {
  FileContentData,
  FileDraftData,
  FileSnapshotData,
  FileWriteData,
} from "./fileContent.data.ts";
import type { FileKey, VersionKey } from "./fileSelection.ts";
import type { FileVersionData } from "./fileVersions.data.ts";

export const PENDING_VERSION_ID = "pending";

/** Create a new file with its first content; the file tree owns new files. */
export type CreateFile = (
  key: FileKey,
  content: string,
  options?: { readonly keepalive?: boolean },
) => Promise<FileWriteData>;

export const FileContentModel = createModel(
  ({ wsId, fileId, versionId }: VersionKey, create: CreateFile, data?: FileContentData) => {
    const version = signal<FileSnapshotData | null>(data?.version ?? null);
    const draft = signal<FileDraftData | null>(data?.draft ?? null);
    // a file started here and not created yet; its first save creates it
    const pending = computed(() => versionId === PENDING_VERSION_ID && version.value === null);

    const initialContent = computed(
      () => draft.value?.content ?? version.value?.content ?? (pending.value ? "" : null),
    );
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
      const params = new URLSearchParams({ wsId, fileId, versionId });
      const fresh = await runLoad(async () =>
        getJson<FileContentData>(`/api/workspaces/files/content?${params}`),
      );
      if (fresh) {
        version.value = fresh.version;
        draft.value = fresh.draft;
      }
    }

    if (data === undefined && !pending.value && !import.meta.env.SSR) void load();

    const [runSave, { loading: saving, error: saveError }] = createAsyncState();

    async function save(options?: { readonly keepalive?: boolean }): Promise<void> {
      const content = markdown.value;
      if (!dirty.value) return;
      if (pending.value) {
        if (content === "") return;
        await runSave(async () => {
          const created = await create({ wsId, fileId }, content, options);
          version.value = { ...created.version, content };
        });
        return;
      }
      const base = version.value;
      if (base === null) return;
      // a newer version saved elsewhere refuses the draft, with its reason in saveError
      const result = await runSave(async () =>
        putJson<FileDraftData>(
          "/api/workspaces/files/draft",
          { wsId, fileId, baseVersionId: base.id, content },
          options,
        ),
      );
      if (result) draft.value = result;
    }

    const [runPromote, { loading: promoting, error: promoteError }] = createAsyncState();

    async function promote(): Promise<boolean> {
      const outcome = await runPromote(async () => {
        if (dirty.value) {
          await save();
          // save() reports through saveError; rethrow so promote surfaces the error
          if (saveError.value !== "") throw new Error(saveError.value);
        }
        const res = await postJson<FileVersionData>("/api/workspaces/files/promote", {
          wsId,
          fileId,
        });
        version.value = { ...res, content: markdown.value };
        draft.value = null;
        return true;
      });
      return outcome ?? false;
    }

    return {
      version,
      draft,
      pending,
      initialState,
      modifiedState,
      setModifiedState,
      state,
      markdown,
      dirty,
      save,
      promote,
      promoting,
      promoteError,
      saving,
      saveError,
      load,
      loading,
      error,
    };
  },
);

export type FileContent = InstanceType<typeof FileContentModel>;
