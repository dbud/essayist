import type { Mark } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getMarks } from "@/signals/marks.ts";

// thread_id -> min MarkNode.offsetTop (relative to the editor column).
export type SidenotePositions = Map<string, number>;
// thread_id -> rendered sidenote height (px).
export type SidenoteHeights = Map<string, number>;
// thread_id -> 1-based ordinal in document order (by mark.offset).
export type MarkNumbers = Map<string, number>;

export interface SidenoteEntry {
  mark: Mark;
  number: number;
  top: number; // stacked top (px)
  active: boolean;
}

// Vertical gap (px) between stacked sidenotes.
const SIDENOTE_GAP = 8;

/**
 * Sidenote presentation for a file. Owns the measured positions (written by
 * the editor extension via trackNodePositions) and heights (written by the
 * FileViewer layout hook via useElementHeights), and derives the ordinal per
 * mark, the cursor's active flag, and the final stacked, sorted entries the
 * sidenote column renders. Per (workspace, path) so each file keeps its own
 * measured state.
 */
export const SidenotesModel = createModel(
  (workspaceId: string, path: string) => {
    const positions = signal<SidenotePositions>(new Map());
    const heights = signal<SidenoteHeights>(new Map());

    const { resolved } = getMarks(workspaceId, path);
    const { markIds: activeMarkIds } = getEditorSelection(workspaceId, path);

    // 1-based ordinal per thread id, in document order. Shared by the editor
    // (data-number badges) and the sidenote column so the numbers always match.
    const numbers = computed((): MarkNumbers => {
      const sorted = [...resolved.value].sort((a, b) => a.offset - b.offset);
      return new Map(sorted.map((item, i) => [item.thread_id, i + 1] as const));
    });

    // Final presentation: marks with stacked top (so notes never overlap),
    // ordinal, and active flag, in mark order. Entries with no measured position
    // are absent; entries with no measured height stack at their mark top
    // (height 0) until measured.
    const entries = computed((): SidenoteEntry[] => {
      const pos = positions.value;
      const nums = numbers.value;
      const h = heights.value;
      const active = activeMarkIds.value;

      const keyed: Array<{
        mark: Mark;
        markTop: number;
        number: number;
        active: boolean;
      }> = [];
      for (const mark of resolved.value) {
        const markTop = pos.get(mark.thread_id);
        if (markTop === undefined) continue; // TODO -- handle stale marks?
        keyed.push({
          mark,
          markTop,
          number: nums.get(mark.thread_id) ?? 0,
          active: active.has(mark.thread_id),
        });
      }
      keyed.sort((a, b) => a.markTop - b.markTop);

      const out: SidenoteEntry[] = [];
      let prevBottom = -Infinity;
      for (const { mark, markTop, number, active } of keyed) {
        const height = h.get(mark.thread_id) ?? 0;
        const top = Math.max(markTop, prevBottom + SIDENOTE_GAP);
        out.push({ mark, number, top, active });
        prevBottom = top + height;
      }
      return out;
    });

    return { positions, heights, numbers, entries };
  },
);

const cache = new Map<string, InstanceType<typeof SidenotesModel>>();

export function getSidenotes(workspaceId: string, path: string) {
  const key = `${workspaceId}:${path}`;
  return cache.getOrInsertComputed(
    key,
    () => new SidenotesModel(workspaceId, path),
  );
}
