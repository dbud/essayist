import { batch, computed, createModel, signal } from "@preact/signals";

import type { PickerDoc } from "#/client/googlePicker.ts";
import createAsyncState from "#/models/utils/asyncState.ts";
import { BatchAuthError, type BatchResult, runBatch } from "#/models/utils/batch.ts";
import { getJson, requestJson } from "#/models/utils/http.ts";
import type { UploadedFile } from "#/utils/fileUpload.ts";

import type { FileTreeData } from "./fileTree.data";

export const FileTreeModel = createModel((wsId: string, data?: FileTreeData) => {
  const files = signal(data?.files ?? []);
  const selectedPath = signal(data?.selectedPath ?? null);
  const selectedVersionId = signal(data?.selectedVersionId ?? null);

  const tree = computed(() => buildFileTree(files.value));

  const [runLoad, { loading, error }] = createAsyncState();

  async function load(): Promise<void> {
    const params = new URLSearchParams({ wsId });
    const fresh = await runLoad(async () =>
      getJson<FileTreeData>(`/api/workspaces/files?${params}`),
    );
    if (fresh) {
      batch(() => {
        files.value = fresh.files;
        selectedPath.value = fresh.selectedPath;
        selectedVersionId.value = fresh.selectedVersionId;
      });
    }
  }

  if (data === undefined && !import.meta.env.SSR) void load();

  function select(path: string | null, versionId?: string | null): void {
    batch(() => {
      selectedPath.value = path;
      // A file switch points at its latest version unless an id arrives.
      selectedVersionId.value =
        versionId ??
        (path === null
          ? null
          : (files.value.find((file) => file.path === path)?.latestVersionId ?? null));
    });
  }

  function selectVersion(versionId: string): void {
    selectedVersionId.value = versionId;
  }

  /** Imports picked Google Docs sequentially. Selects the first imported file. */
  async function importDocs(
    docs: readonly PickerDoc[],
    onStep?: (index: number, name: string) => void,
  ): Promise<BatchResult> {
    let firstPath: string | null = null;
    const result = await runBatch(
      docs,
      async (doc) => {
        const res = await requestJson<{ created: boolean; path: string }>(
          "POST",
          "/api/workspaces/import/google-docs",
          { wsId, docId: doc.id, name: doc.name },
        );
        if (res.status === 401) {
          throw new BatchAuthError();
        }
        if (!res.ok || res.data === undefined) {
          throw new Error(`${doc.name}: ${res.message ?? `failed (${res.status})`}`);
        }
        if (!res.data.created) {
          return { updated: true };
        }
        if (firstPath === null) {
          firstPath = res.data.path;
        }
      },
      { concurrency: 1, onStart: (doc, index) => onStep?.(index, doc.name) },
    );
    await load();
    if (firstPath !== null) {
      select(firstPath);
    }
    return result;
  }

  /** Upsert every text file with a small parallel pool; binaries never reach this, so the
   * caller reports their paths through `skipped`. Selects the first uploaded file. */
  async function uploadFiles(
    items: readonly UploadedFile[],
    options?: {
      readonly skipped?: readonly string[];
      readonly onProgress?: (done: number, total: number) => void;
    },
  ): Promise<BatchResult> {
    let firstPath: string | null = null;
    const result = await runBatch(
      items,
      async (item) => {
        const res = await requestJson("PUT", "/api/workspaces/files/upsert", {
          wsId,
          path: item.path,
          content: item.content,
        });
        if (res.status === 401) {
          throw new BatchAuthError();
        }
        if (!res.ok) {
          throw new Error(`${item.path}: ${res.message ?? `failed (${res.status})`}`);
        }
        if (firstPath === null) {
          firstPath = item.path;
        }
      },
      { concurrency: 4, ...options },
    );
    await load();
    if (firstPath !== null) {
      select(firstPath);
    }
    return result;
  }

  return {
    files,
    selectedPath,
    selectedVersionId,
    select,
    selectVersion,
    tree,
    load,
    loading,
    error,
    importDocs,
    uploadFiles,
  };
});

export type FileTree = InstanceType<typeof FileTreeModel>;

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

function buildFileTree(files: FileTreeData["files"]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isFile: false,
    children: [],
  };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          path,
          isFile,
          children: [],
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode) {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTree(child);
  }
}
