import type { Mark } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import createAsyncState from "@/utils/asyncState.ts";

export const MarksModel = createModel((path: string) => {
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState();

  async function load() {
    const result = await run(async () => {
      const res = await fetch(`/api/files/${encodeURIComponent(path)}/marks`);
      return (await res.json()) as Mark[];
    });
    if (result) marks.value = result;
  }

  load();

  return {
    marks,
    loading,
    error,
    reload: load,
  };
});

const marksMap = new Map<string, InstanceType<typeof MarksModel>>();

export function useMarks(path: string) {
  return marksMap.getOrInsertComputed(path, () => new MarksModel(path));
}
