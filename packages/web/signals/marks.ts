import type { Mark } from "@essayist/core";
import { resolveMarks } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import { useFile } from "@/signals/file.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import type { NodeRange } from "@/utils/textNodeMapping.ts";

export const MarksModel = createModel((path: string) => {
  const { content, markdown, getNodeRange } = useFile(path);
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState();

  const resolved = deepComputed(() =>
    resolveMarks({
      marks: marks.value,
      oldContent: content.value,
      newContent: markdown.value,
    }),
  );

  const ranges = deepComputed(() =>
    resolved.value.map((mark) => ({ mark, range: getNodeRange(mark) })),
  );

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
    ranges,
    loading,
    error,
    reload: load,
  };
});

const marksMap = new Map<string, InstanceType<typeof MarksModel>>();

export function useMarks(path: string) {
  return marksMap.getOrInsertComputed(path, () => new MarksModel(path));
}

export interface MarkWithRange {
  mark: Mark;
  range: NodeRange;
}
