import type { Mark } from "@essayist/core";
import { computed, createModel, signal } from "@preact/signals";
import type { NodeKey } from "lexical";
import { getEditorSelection } from "@/signals/editorSelection.ts";
import { getMarks } from "@/signals/marks.ts";

// thread_id -> min MarkNode.offsetTop (relative to the editor column).
export type SidenotePositions = Map<string, number>;
// thread_id -> rendered sidenote height (px).
export type SidenoteHeights = Map<string, number>;
// thread_id -> 1-based ordinal in document order (by mark.offset).
export type MarkNumbers = Map<string, number>;

// One per MarkNode fragment: ordinal label rendered at the end of the
// fragment's text, positioned over the editor (not in the contentEditable).
export interface MarkBadge {
  key: NodeKey;
  left: number; // end-x of the fragment's text, relative to the editor column
  top: number; // line top at that end, relative to the editor column
  numbers: number[]; // ordinals of the marks covering this fragment, ascending
}

export interface SidenoteEntry {
  mark: Mark;
  number: number;
  markTop: number; // raw mark position, before stacking
  active: boolean;
}

// One render slot for the sidenote column. `top` is the render position
// (pinned to the viewport edge for ghosts); `trueTop` is the stacked layout
// position (scroll target). `ghost` is set only for offscreen sidenotes
// pulled to the viewport edge.
export interface SidenoteView {
  key: string;
  entry: SidenoteEntry;
  top: number;
  trueTop: number;
  height: number;
  ghost?: "up" | "down";
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
    const markBadges = signal<MarkBadge[]>([]);
    // Scroll container viewport, written by `useScrollViewport` in FileViewer.
    const scrollTop = signal(0);
    const viewportHeight = signal(0);

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
        if (markTop === undefined) continue; // not yet measured
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

    // Render slots: each entry at its stacked top, plus up to two ghosts for
    // the nearest sidenotes entirely offscreen above/below, pulled to the
    // viewport edge. A ghost is skipped if its pinned slot would overlap an
    // on-screen sidenote (no room) or its height is unmeasured.
    const viewportLayout = computed((): SidenoteView[] => {
      // Real views: one per entry at its stacked top. Ghosts are appended after
      // the offscreen/overlap checks, so this is exactly the real-view set
      // while those run.
      const out: SidenoteView[] = entries.value.map((entry) => {
        const top = layout.value.get(entry.mark.thread_id) ?? entry.markTop;
        const height = heights.value.get(entry.mark.thread_id) ?? 0;
        return { key: entry.mark.thread_id, entry, top, trueTop: top, height };
      });
      const vh = viewportHeight.value;
      if (vh <= 0) return out;
      const vTop = scrollTop.value;
      const vBottom = vTop + vh;

      // Does [lo, hi) overlap any real view's box (other than skipTid)?
      const overlaps = (lo: number, hi: number, skipTid: string): boolean =>
        out.some(
          (v) =>
            v.entry.mark.thread_id !== skipTid &&
            v.height > 0 &&
            v.top < hi &&
            v.top + v.height > lo,
        );

      // Pull an offscreen view to a viewport edge as a ghost, if there's room.
      // The ghost renders one clamped line, so its rendered height is less than
      // the real `height`; we pin by edge (bottom for down, top for up) and let
      // the component translate the down ghost up by its own height. The fit
      // check uses the real height (conservative: taller than the ghost).
      const ghost = (
        { entry, top, height }: SidenoteView,
        direction: "up" | "down",
      ): SidenoteView | undefined => {
        if (height <= 0) return undefined;
        const pinnedTop = direction === "down" ? vBottom : vTop;
        const lo = direction === "down" ? vBottom - height : vTop;
        const hi = direction === "down" ? vBottom : vTop + height;
        if (overlaps(lo, hi, entry.mark.thread_id)) return undefined;
        return {
          key: `${entry.mark.thread_id}:ghost-${direction}`,
          entry,
          top: pinnedTop,
          trueTop: top,
          height,
          ghost: direction,
        };
      };

      const down = out.find((v) => v.top >= vBottom);
      const up = out.findLast((v) => v.top + v.height <= vTop);
      const downGhost = down && ghost(down, "down");
      if (downGhost) out.push(downGhost);
      const upGhost = up && ghost(up, "up");
      if (upGhost) out.push(upGhost);
      return out;
    });

    return {
      positions,
      heights,
      numbers,
      entries,
      layout,
      viewportLayout,
      markBadges,
      scrollTop,
      viewportHeight,
    };
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
