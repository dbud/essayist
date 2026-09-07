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

// One band of a marked segment on a single visual line. A segment carrying N
// ids yields N bands stacked vertically within each of its line-rects.
export interface MarkRect {
  id: string; // thread id this band belongs to
  color: string; // oklch(var(--mark-l) var(--mark-c) <hue>)
  left: number; // editor-column-local
  top: number;
  width: number;
  height: number; // visual line box height
  order: number; // band index within the line (0 = topmost mark)
  bandCount: number; // bands on this line
}

export interface SidenoteEntry {
  mark: Mark;
  number: number;
  markTop: number; // raw mark position, before stacking
  active: boolean;
}

interface SidenoteViewBase {
  key: string;
  entry: SidenoteEntry;
}

// Real render slot, rendered by Sidenote at its stacked position.
export interface SidenoteView extends SidenoteViewBase {
  top: number;
  height: number; // measured height, 0 while unmeasured
}

// Ghost render slot: offscreen sidenote pinned to a viewport edge by CSS in
// GhostSidenote (no render position).
export interface GhostSidenoteView extends SidenoteViewBase {
  ghost: "top" | "bottom";
  trueTop: number; // scroll target on click
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
    const markRects = signal<MarkRect[]>([]);
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

    // Render slots: one per entry at its stacked top.
    const viewportLayout = computed((): SidenoteView[] =>
      entries.value.map((entry) => {
        const top = layout.value.get(entry.mark.thread_id) ?? entry.markTop;
        const height = heights.value.get(entry.mark.thread_id) ?? 0;
        return { key: entry.mark.thread_id, entry, top, height };
      }),
    );

    // Ghost: the nearest sidenote extending past this viewport edge (strict:
    // at exact edge alignment the regular sidenote wins and no ghost is
    // mounted), with a measured height. Ghosts render beneath real
    // sidenotes, whose backgrounds occlude them where they overlap.
    const edgeGhost = (
      direction: "top" | "bottom",
    ): GhostSidenoteView | undefined => {
      const vh = viewportHeight.value;
      if (vh <= 0) return undefined;
      const vTop = scrollTop.value;
      const vBottom = vTop + vh;
      const views = viewportLayout.value;
      const candidate =
        direction === "bottom"
          ? views.find((v) => v.top + v.height > vBottom)
          : views.findLast((v) => v.top < vTop);
      if (!candidate || candidate.height <= 0) return undefined;
      const { entry, top } = candidate;
      return {
        key: `${entry.mark.thread_id}:ghost-${direction}`,
        entry,
        trueTop: top,
        ghost: direction,
      };
    };

    const topGhost = computed(() => edgeGhost("top"));
    const bottomGhost = computed(() => edgeGhost("bottom"));

    return {
      positions,
      heights,
      numbers,
      entries,
      layout,
      viewportLayout,
      topGhost,
      bottomGhost,
      markBadges,
      markRects,
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
