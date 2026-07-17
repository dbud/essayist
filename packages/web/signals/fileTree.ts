import type { FileEntry } from "@essayist/core";
import { computed, createModel, type Signal, signal } from "@preact/signals";
import { useMemo } from "preact/hooks";
import { openedFiles } from "@/signals/openedFiles.ts";
import { onWorkspaceChange, workspaces } from "@/signals/workspace.ts";
import createAsyncState from "@/utils/asyncState.ts";

export const FileTreeModel = createModel(() => {
  const files = signal<FileEntry[]>([]);
  const [run, { loading, error }] = createAsyncState();

  const tree = computed(() => buildFileTree(files.value));

  async function load() {
    const wsId = workspaces.currentWorkspaceId.value;
    if (!wsId) return;
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(wsId)}/files`,
      );
      return (await res.json()) as FileEntry[];
    });
    if (result) files.value = result;
  }

  onWorkspaceChange(load);

  return {
    files,
    loading,
    error,
    tree,
  };
});

export function useFiles() {
  return useMemo(() => new FileTreeModel(), []);
}

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isSelected: Signal<boolean>;
  children: TreeNode[];
}

function buildFileTree(files: FileEntry[]): TreeNode {
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
          isSelected: computed(() => openedFiles.selected.value === path),
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
