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
  markTop: number; // raw mark position, before stacking
  active: boolean;
}

// Vertical gap (px) between stacked sidenotes.
const SIDENOTE_GAP = 8;

/**
 * Sidenote presentation for a file. Owns the measured positions (written by
 * the editor extension via trackNodePositions) and heights (written by the
 * FileViewer layout hook via useElementHeights), and derives the ordinal per
 * mark, the cursor's active flag, the raw sorted entries, and the stacked
 * tops. Per (workspace, path) so each file keeps its own measured state.
 *
 * `entries` is independent of `heights`; `layout` is the only reader of
 * `heights`.
 */
export const SidenotesModel = createModel(
  (workspaceId: string, path: string) => {
    const positions = signal<SidenotePositions>(new Map());
    const heights = signal<SidenoteHeights>(new Map());

    const { resolved } = getMarks(workspaceId, path);
    const { markIds: activeMarkIds } = getEditorSelection(workspaceId, path);

    // 1-based ordinal per thread id, in document order. Shared by the editor
    // (data-number badges) and the sidenote column so the numbers always match.
    const numbers = computed(
      (): MarkNumbers =>
        new Map(
          [...resolved.value]
            .sort((a, b) => a.offset - b.offset)
            .map((item, i) => [item.thread_id, i + 1] as const),
        ),
    );

    // Raw sidenotes: mark + ordinal + active flag + mark position, sorted by
    // position. Independent of measured heights.
    const entries = computed((): SidenoteEntry[] => {
      const out: SidenoteEntry[] = [];
      for (const mark of resolved.value) {
        const markTop = positions.value.get(mark.thread_id);
        if (markTop === undefined) continue; // TODO -- handle stale marks?
        out.push({
          mark,
          markTop,
          number: numbers.value.get(mark.thread_id) ?? 0,
          active: activeMarkIds.value.has(mark.thread_id),
        });
      }
      return out.sort((a, b) => a.markTop - b.markTop);
    });

    // Stacked tops so sidenotes never overlap: walk in mark order, pushing each
    // down to clear the previous one's measured height. Unmeasured entries
    // (height 0) stack at their mark top until measured.
    const layout = computed((): Map<string, number> => {
      const out = new Map<string, number>();
      let prevBottom = -Infinity;
      for (const { mark, markTop } of entries.value) {
        const height = heights.value.get(mark.thread_id) ?? 0;
        const top = Math.max(markTop, prevBottom + SIDENOTE_GAP);
        out.set(mark.thread_id, top);
        prevBottom = top + height;
      }
      return out;
    });

    return { positions, heights, numbers, entries, layout };
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
