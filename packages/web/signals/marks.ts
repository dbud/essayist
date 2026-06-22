import type { Mark } from "@essayist/core";
import { resolveMarks } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { useFile } from "@/signals/file.ts";
import createAsyncState from "@/utils/asyncState.ts";

export const MarksModel = createModel((path: string) => {
  const file = useFile(path);
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState();

  const resolved = computed((): Mark[] => {
    const originalContent = file.content.value?.content;
    const markdown = file.markdown.value;
    if (!originalContent || !markdown || marks.value.length === 0) return [];

    return resolveMarks({
      marks: marks.value,
      oldContent: originalContent,
      newContent: markdown,
    });
  });

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
    resolved,
    loading,
    error,
    reload: load,
  };
});

const marksMap = new Map<string, InstanceType<typeof MarksModel>>();

export function useMarks(path: string) {
  return marksMap.getOrInsertComputed(path, () => new MarksModel(path));
}
