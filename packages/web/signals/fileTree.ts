import type { FileEntry } from "@essayist/core";
import { computed, createModel, type Signal, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { getOpenedFilesFor } from "@/signals/openedFiles.ts";
import { workspaces } from "@/signals/workspace.ts";
import createAsyncState from "@/utils/asyncState.ts";

export const FileTreeModel = createModel((workspaceId: string) => {
  const files = signal<FileEntry[]>([]);
  const [run, { loading, error }] = createAsyncState(true);

  const tree = computed(() => buildFileTree(files.value, workspaceId));

  async function load() {
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files`,
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
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
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? `Request failed (${res.status})`);
    }
    await load();
  }

  if (IS_BROWSER) void load();

  return { files, loading, error, tree, createFile };
});

const cache = new Map<string, FileTree>();

export type FileTree = InstanceType<typeof FileTreeModel>;

export function getFileTreeFor(workspaceId: string): FileTree {
  return cache.getOrInsertComputed(
    workspaceId,
    () => new FileTreeModel(workspaceId),
  );
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
  isSelected: Signal<boolean>;
  children: TreeNode[];
}

function buildFileTree(files: FileEntry[], workspaceId: string): TreeNode {
  const root: TreeNode = {
    name: "",
    path: "",
    isFile: false,
    children: [],
    isSelected: signal(false),
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
          isSelected: computed(
            () => getOpenedFilesFor(workspaceId).selected.value === path,
          ),
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
