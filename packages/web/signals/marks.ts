import type { Mark } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import createAsyncState from "@/utils/asyncState.ts";

export interface MarkGroup {
  thread_id: string;
  marks: Mark[];
}

export const MarksModel = createModel((path: string) => {
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState();

  const grouped = computed(() => groupMarks(marks.value));

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
    grouped,
    loading,
    error,
    reload: load,
  };
});

const marksMap = new Map<string, InstanceType<typeof MarksModel>>();

export function useMarks(path: string) {
  return marksMap.getOrInsertComputed(path, () => new MarksModel(path));
}

function groupMarks(marks: Mark[]): MarkGroup[] {
  const map = new Map<string, Mark[]>();
  for (const m of marks) {
    const existing = map.get(m.thread_id);
    if (existing) {
      existing.push(m);
    } else {
      map.set(m.thread_id, [m]);
    }
  }
  return Array.from(map.entries()).map(([thread_id, groupMarks]) => ({
    thread_id,
    marks: groupMarks,
  }));
}
