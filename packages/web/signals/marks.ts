import type { Mark } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import type { NodeRange } from "@/editor/textNodeSpans.ts";
import { useFile } from "@/signals/file.ts";
import { asyncComputed } from "@/utils/asyncComputed.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import { resolveMarksViaWorker } from "@/wasm/client.ts";

export interface RangedMark {
  mark: Mark;
  range: NodeRange;
}

export const MarksModel = createModel((path: string) => {
  const { content, markdown, getNodeRange } = useFile(path);
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState();

  // Resolve marks in the wasm worker (off the main thread), debounced so a
  // burst of edits coalesces into one `resolveMarks` call. `resolveMarks`
  // itself stays synchronous -- it runs in the worker. `value` holds the
  // latest resolved marks; `stale` is true while a recompute is pending.
  const { value: resolved, stale: resolving } = asyncComputed(
    () => [marks.value, content.value, markdown.value] as const,
    ([m, oldContent, newContent]) =>
      resolveMarksViaWorker(m, oldContent, newContent),
    { debounce: 60, initial: [] as Mark[] },
  );

  const ranges = deepComputed((): RangedMark[] =>
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
    resolving,
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
