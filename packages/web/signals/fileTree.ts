import { computed, createModel, signal } from "@preact/signals";
import { FileEntry } from "@essayist/core";
import createAsyncState from "@/utils/asyncState.ts";
import { useMemo } from "preact/hooks";
import { buildFileTree, type TreeNode } from "@/utils/fileTree.ts";

export const FileTreeModel = createModel((/* TODO: workspaceId */) => {
  const files = signal<FileEntry[]>([]);
  const [run, { loading, error }] = createAsyncState();

  const tree = computed(() => buildFileTree(files.value));

  async function load() {
    const result = await run(async () => {
      const res = await fetch("/api/files");
      return await res.json() as FileEntry[];
    });
    if (result) files.value = result;
  }

  load();

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

export type { TreeNode };
