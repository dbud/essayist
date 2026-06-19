import { createModel, signal } from "@preact/signals";
import { FileEntry } from "@essayist/core";
import createAsyncState from "@/utils/asyncState.ts";
import { useMemo } from "preact/hooks";

export const FileTreeModel = createModel((/* TODO: workspaceId */) => {
  const files = signal<FileEntry[]>([]);
  const [run, { loading, error }] = createAsyncState();

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
  };
});

export function useFiles() {
  return useMemo(() => new FileTreeModel(), []);
}
