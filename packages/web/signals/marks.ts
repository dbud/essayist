import type { Mark } from "@essayist/core";
import { createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import type { NodeRange } from "@/editor/textNodeSpans.ts";
import { getFile } from "@/signals/file.ts";
import { asyncComputed } from "@/utils/asyncComputed.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import { resolveMarksViaWorker } from "@/wasm/client.ts";

export interface RangedMark {
  mark: Mark;
  range: NodeRange;
}

export const MarksModel = createModel((workspaceId: string, path: string) => {
  const { content, markdown, getNodeRange } = getFile(workspaceId, path);
  const marks = signal<Mark[]>([]);
  const [run, { loading, error }] = createAsyncState(true);

  // Resolve marks in the wasm worker, debounced so a burst of edits
  // coalesces into one call. A new edit aborts the in-flight resolve and
  // terminates the blocked worker, so stale computes don't block the latest.
  const { value: resolved, stale: resolving } = asyncComputed(
    () => [marks.value, content.value, markdown.value] as const,
    ([marks, oldContent, newContent], signal) =>
      resolveMarksViaWorker(marks, oldContent, newContent, signal),
    { debounce: 60, initial: [] as Mark[] },
  );

  const ranges = deepComputed((): RangedMark[] =>
    resolved.value.map((mark) => ({ mark, range: getNodeRange(mark) })),
  );

  async function load() {
    const result = await run(async () => {
      const res = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(path)}/marks`,
      );
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as Mark[];
    });
    if (result) marks.value = result;
  }

  if (IS_BROWSER) void load();

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

const cache = new Map<string, InstanceType<typeof MarksModel>>();

export function getMarks(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new MarksModel(workspaceId, path),
  );
}

export interface MarkWithRange {
  mark: Mark;
  range: NodeRange;
}
