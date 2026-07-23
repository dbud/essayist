import type { Mark } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import type { NodeRange } from "@/editor/textNodeSpans.ts";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getFile } from "@/signals/file.ts";
import { sidenotePositions } from "@/signals/sidenotePositions.ts";
import { asyncComputed } from "@/utils/asyncComputed.ts";
import createAsyncState from "@/utils/asyncState.ts";
import { deepComputed } from "@/utils/deepComputed.ts";
import { resolveMarksViaWorker } from "@/wasm/client.ts";

export interface RangedMark {
  mark: Mark;
  range: NodeRange;
}

export interface SidenoteEntry {
  mark: Mark;
  top: number;
  active: boolean;
  number: number;
}

// thread_id -> 1-based ordinal in document order (by mark.offset).
export type MarkNumbers = Map<string, number>;

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

  // 1-based ordinal per thread id, in document order. Shared by the editor
  // (data-number badges) and the sidenote column so the numbers always match.
  const markNumbers = computed((): MarkNumbers => {
    const sorted = [...resolved.value].sort((a, b) => a.offset - b.offset);
    const map: MarkNumbers = new Map();
    for (let i = 0; i < sorted.length; i++) {
      map.set(sorted[i].thread_id, i + 1);
    }
    return map;
  });

  // Marks joined with their measured top offset (from the active editor), the
  // cursor's active flag, and their ordinal -- ready for the sidenote column
  // to render without any per-component signal joining.
  const { markIds } = getEditorSelection(workspaceId, path);
  const sidenotes = computed((): SidenoteEntry[] => {
    const positions = sidenotePositions.value;
    const numbers = markNumbers.value;
    const out: SidenoteEntry[] = [];
    for (const mark of resolved.value) {
      const top = positions.get(mark.thread_id);
      if (top === undefined) continue;
      out.push({
        mark,
        top,
        active: markIds.value.has(mark.thread_id),
        number: numbers.get(mark.thread_id) ?? 0,
      });
    }
    out.sort((a, b) => a.top - b.top);
    return out;
  });

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
    markNumbers,
    sidenotes,
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
