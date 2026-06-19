import { createModel, signal } from "@preact/signals";
import { FileSnapshot } from "@essayist/core";
import createAsyncState from "@/utils/asyncState.ts";

export const FileModel = createModel((path: string) => {
  const content = signal<FileSnapshot | null>(null);
  const [run, { loading, error }] = createAsyncState();

  async function load() {
    const result = await run(async () => {
      const res = await fetch(`/api/files/${encodeURIComponent(path)}`);
      return await res.json() as FileSnapshot;
    });
    if (result) content.value = result;
  }

  load();

  return {
    content,
    loading,
    error,
  };
});

const fileMap = new Map<string, InstanceType<typeof FileModel>>();

export function useFile(path: string) {
  return fileMap.getOrInsertComputed(path, () => new FileModel(path));
}
