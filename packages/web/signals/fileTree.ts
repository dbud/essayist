import type { FileEntry } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { get, seed } from "@/signals/models.ts";
import { workspaces } from "@/signals/workspace.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { ensureOk } from "@/utils/ensureOk.ts";
import type { UploadedFile } from "@/utils/fileUpload.ts";
import createProgressState from "@/utils/progressState.ts";

export const FileTreeModel = createModel((workspaceId: string) => {
  const files = signal<FileEntry[]>([]);
  const [run, { loading, error }] = createAsyncState(true);
  const [runUpload, { progress: uploadProgress }] = createProgressState();

  const tree = computed(() => buildFileTree(files.value));

  async function load() {
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files`,
      );
      await ensureOk(res);
      return (await res.json()) as FileEntry[];
    });
    if (result) files.value = result;
  }

  /** Create a new file via POST to the files endpoint, then reload the tree. */
  async function createFile(path: string, content = ""): Promise<void> {
    const res = await fetch(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    await ensureOk(res);
    await load();
  }

  /**
   * Upsert files via PUT. Used by uploads where replacing existing content is
   * expected. Files are uploaded in parallel; the runner's `uploadProgress`
   * signal updates as each file settles so the caller can subscribe via
   * `effect()`. The tree is reloaded once after all uploads settle.
   */
  async function uploadFiles(items: UploadedFile[]): Promise<void> {
    if (items.length === 0) return;

    await runUpload(items, async ({ path, content }) => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      try {
        await ensureOk(res);
      } catch (err) {
        throw new Error(
          `${path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    await load();
  }

  // Prefer a server-provided seed over a REST fetch when available.
  const seeded = seed<FileEntry[]>("tree", workspaceId);
  if (seeded) {
    files.value = seeded;
    loading.value = false;
  }
  if (IS_BROWSER && !seeded) void load();

  return {
    files,
    loading,
    error,
    tree,
    createFile,
    uploadFiles,
    uploadProgress,
    load,
  };
});

export type FileTree = InstanceType<typeof FileTreeModel>;

export function getFileTreeFor(workspaceId: string): FileTree {
  return get("tree", workspaceId, () => new FileTreeModel(workspaceId));
}

// Returns `null` while no workspace is selected (bootstrap, login page).
export function getFileTree(): FileTree | null {
  const wsId = workspaces.currentWorkspaceId.value;
  return wsId ? getFileTreeFor(wsId) : null;
}

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: TreeNode[];
}

function buildFileTree(files: FileEntry[]): TreeNode {
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

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    sortTree(child);
  }
}
