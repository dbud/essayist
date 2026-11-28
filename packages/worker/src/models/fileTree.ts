import { batch, computed, createModel, signal } from "@preact/signals";
import { assertExists } from "@std/assert";
import { toKebabCase } from "@std/text/to-kebab-case";

import createAsyncState from "#/models/utils/asyncState.ts";
import { BatchAuthError, type BatchResult, runBatch } from "#/models/utils/batch.ts";
import { getJson, requestJson } from "#/models/utils/http.ts";
import type { UploadedFile } from "#/utils/fileUpload.ts";

import type { FileWriteData } from "./fileContent.data.ts";
import { PENDING_VERSION_ID } from "./fileContent.ts";
import type { FileEntryData, FileTreeData } from "./fileTree.data";

export interface PickerDoc {
  id: string;
  name: string;
}

export const FileTreeModel = createModel((wsId: string, data?: FileTreeData) => {
  const files = signal<readonly FileEntryData[]>(data?.files ?? []);
  // files started here and not created yet, with the id their creation will use
  const pending = signal<readonly TreeEntry[]>([]);
  const entries = computed((): readonly TreeEntry[] => [
    ...files.value.map(({ file }) => ({ id: file.id, path: file.path })),
    ...pending.value,
  ]);
  const selectedFileId = signal(data?.selectedFileId ?? null);
  const selectedVersionId = signal(data?.selectedVersionId ?? null);

  const tree = computed(() => buildFileTree(entries.value));

  const [runLoad, { loading, error }] = createAsyncState();

  async function load(): Promise<void> {
    const params = new URLSearchParams({ wsId });
    const fresh = await runLoad(async () =>
      getJson<FileTreeData>(`/api/workspaces/files?${params}`),
    );
    if (fresh) {
      batch(() => {
        files.value = fresh.files;
        // a pending file stays only until the server lists it
        pending.value = pending.value.filter(
          ({ id }) => !fresh.files.some(({ file }) => file.id === id),
        );
        selectedFileId.value = fresh.selectedFileId;
        selectedVersionId.value = fresh.selectedVersionId;
      });
    }
  }

  if (data === undefined && !import.meta.env.SSR) void load();

  function latestVersionId(fileId: string): string | null {
    const saved = files.value.find(({ file }) => file.id === fileId);
    if (saved !== undefined) return saved.latest.id;
    return pending.value.some(({ id }) => id === fileId) ? PENDING_VERSION_ID : null;
  }

  function pathOf(fileId: string | null): string | null {
    return entries.value.find(({ id }) => id === fileId)?.path ?? null;
  }

  function fileIdAt(path: string | null): string | null {
    return entries.value.find((entry) => entry.path === path)?.id ?? null;
  }

  function select(fileId: string | null, versionId?: string | null): void {
    batch(() => {
      selectedFileId.value = fileId;
      // A file switch points at its latest version unless an id arrives.
      selectedVersionId.value = versionId ?? (fileId === null ? null : latestVersionId(fileId));
    });
  }

  function startPending(name: string): void {
    const stem = pendingStem(name);
    const path = freePath(`${stem}.md`, new Set(entries.value.map((entry) => entry.path)));
    const id = crypto.randomUUID();
    batch(() => {
      pending.value = [...pending.value, { id, path }];
      select(id, PENDING_VERSION_ID);
    });
  }

  /** Create a pending file with its first content, which makes it a saved file. */
  async function create(
    fileId: string,
    content: string,
    options?: { readonly keepalive?: boolean },
  ): Promise<FileWriteData> {
    const entry = pending.peek().find(({ id }) => id === fileId);
    assertExists(entry, "only a new file is created");
    const { path } = entry;
    const res = await requestJson<FileWriteData>(
      "POST",
      "/api/workspaces/files/create",
      { wsId, fileId, path, content },
      options,
    );
    if (!res.ok || res.data === undefined) {
      throw new Error(
        res.message ?? (res.status === 409 ? `${path}: already exists` : `failed (${res.status})`),
      );
    }
    const created = res.data;
    batch(() => {
      files.value = [...files.peek(), { file: created.file, latest: created.version }];
      pending.value = pending.peek().filter(({ id }) => id !== fileId);
      // the save of a file left behind keeps the selection where it is
      if (selectedFileId.peek() === fileId) selectedVersionId.value = created.version.id;
    });
    return created;
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
      select(fileIdAt(firstPath));
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
    // Same-name items in one drop keep their contents: the first keeps the plain path (an existing
    // file gets a new version on top), later ones move to a fresh path.
    const assigned = new Set<string>();
    const scheduled = items.map((item) => {
      const path = freePath(item.path, assigned);
      assigned.add(path);
      return { item, path };
    });
    const result = await runBatch(
      scheduled,
      async ({ item, path }) => {
        const res = await requestJson("PUT", "/api/workspaces/files/upsert", {
          wsId,
          path,
          content: item.content,
        });
        if (res.status === 401) {
          throw new BatchAuthError();
        }
        if (!res.ok) {
          throw new Error(`${path}: ${res.message ?? `failed (${res.status})`}`);
        }
        if (firstPath === null) {
          firstPath = path;
        }
      },
      { concurrency: 4, ...options },
    );
    await load();
    if (firstPath !== null) {
      select(fileIdAt(firstPath));
    }
    return result;
  }

  return {
    files,
    selectedFileId,
    selectedVersionId,
    pathOf,
    fileIdAt,
    select,
    selectVersion,
    tree,
    load,
    loading,
    error,
    importDocs,
    uploadFiles,
    startPending,
    create,
  };
});

export type FileTree = InstanceType<typeof FileTreeModel>;

export interface TreeEntry {
  id: string;
  path: string;
}

export interface TreeNode {
  name: string;
  path: string;
  /** The file at this node; null for a folder. */
  fileId: string | null;
  children: TreeNode[];
}

function buildFileTree(entries: readonly TreeEntry[]): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    fileId: null,
    children: [],
  };

  for (const entry of entries) {
    const parts = entry.path.split("/");
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
          fileId: isFile ? entry.id : null,
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
    const aIsFile = a.fileId !== null;
    const bIsFile = b.fileId !== null;
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTree(child);
  }
}

function pendingStem(name: string): string {
  const slug = toKebabCase(name);
  return slug === "" ? "untitled" : slug;
}

/** The first unused path, suffixing the stem with -2, -3, ... before the extension. */
function freePath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) return path;
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const hasExtension = dot > slash;
  const stem = hasExtension ? path.slice(0, dot) : path;
  const ext = hasExtension ? path.slice(dot) : "";
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}
