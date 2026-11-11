import type { Mark } from "@essayist/core";
import { type Signal, computed, createModel, signal } from "@preact/signals";
import { sortBy } from "@std/collections";
import type { NodeKey } from "lexical";

import { colorForMark } from "#/editor/markColors.ts";
import { Layout, type Measured, type MarkedBlock } from "#/geometry/layout.ts";
import type { Categories } from "#/models/categories.ts";
import { FileKey } from "#/models/fileSelection.ts";
import type { ResolvedMarks } from "#/models/resolvedMarks.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";

// thread_id -> min MarkNode.offsetTop (relative to the editor column).
export type SidenotePositions = Map<string, number>;
// thread_id -> rendered sidenote height (px).
export type SidenoteHeights = Map<string, number>;
// thread_id -> 1-based ordinal in document order (by mark.offset).
export type MarkOrdinals = Map<string, number>;

// A badge per MarkNode fragment: an ordinal label rendered at the end of the text of the fragment,
// positioned over the editor (not in the contentEditable).
export interface MarkBadge {
  key: NodeKey;
  left: number; // end-x of the fragment's text, relative to the editor column
  top: number; // line top at that end, relative to the editor column
  ordinals: number[]; // ordinals of the marks covering this fragment, ascending
}

// A band of a marked segment on a single visual line. A segment carrying N ids yields N bands
// stacked vertically within each of its line-rects.
export interface MarkRect {
  id: string; // thread id this band belongs to
  color: string; // category color or FALLBACK_COLOR (from markColors.ts)
  left: number; // editor-column-local
  top: number;
  width: number;
  height: number; // visual line box height
  order: number; // band index within the line (0 = topmost mark)
  bandCount: number; // bands on this line
}

export type MarkedBlocks = Map<NodeKey, MarkedBlock>;
// thread id -> the block key containing the mark's fragments.
export type MarkBlocks = Map<string, NodeKey>;

export interface SidenoteEntry {
  mark: Mark;
  ordinal: number;
  markTop: number; // raw mark position, before stacking
  active: boolean;
  color: string; // category color or fallback (markColors.ts)
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

// Ghost render slot: offscreen sidenote pinned to a viewport edge by CSS in GhostSidenote (no
// render position).
export interface GhostSidenoteView extends SidenoteViewBase {
  ghost: "top" | "bottom";
  trueTop: number; // scroll target on click
}

interface SidenotesDeps {
  resolvedMarks: ResolvedMarks;
  categories: Categories;
  scrollTop: Signal<number>;
  viewportHeight: Signal<number>;
}

/**
 * Sidenote presentation for a file. Owns the mark positions and marked-block geometry (written by
 * the editor extension) and heights (written by the FileViewer layout hook via useElementHeights),
 * and derives the ordinal per mark, the active flag, the raw sorted entries, and the reflow
 * (stacked tops plus block margins). Per (workspace, path, version) so each file and view keeps its
 * own measured state.
 *
 * `entries` is independent of `heights`; the reflow is the only reader of `heights`.
 */
export const SidenotesModel = createModel((key: FileKey, deps: SidenotesDeps) => {
  const { resolvedMarks, categories, scrollTop, viewportHeight } = deps;
  const positions = signal<SidenotePositions>(new Map());
  const heights = signal<SidenoteHeights>(new Map());
  const markBadges = signal<MarkBadge[]>([]);
  const markRects = signal<MarkRect[]>([]);
  const markedBlocks = signal<MarkedBlocks>(new Map());
  const markBlocks = signal<MarkBlocks>(new Map());

  const { resolved } = resolvedMarks;
  const { markIds: activeMarkIds } = getEditorSelection(key);

  // 1-based ordinal per thread id, in document order. Shared by the editor's badges and the
  // sidenote column so the ordinals always match.
  const markOrdinals = computed(
    (): MarkOrdinals =>
      new Map(
        sortBy(resolved.value, (mark) => mark.offset).map(
          (item, i) => [item.thread_id, i + 1] as const,
        ),
      ),
  );

  // Raw sidenotes: mark + ordinal + active flag + mark position, sorted by position. Independent of
  // measured heights.
  const entries = computed((): SidenoteEntry[] => {
    const out: SidenoteEntry[] = [];
    for (const mark of resolved.value) {
      const markTop = positions.value.get(mark.thread_id);
      if (markTop === undefined) continue; // not yet measured
      out.push({
        mark,
        markTop,
        ordinal: markOrdinals.value.get(mark.thread_id) ?? 0,
        active: activeMarkIds.value.has(mark.thread_id),
        color: colorForMark(mark, categories),
      });
    }
    return out.toSorted((a, b) => a.markTop - b.markTop || a.mark.offset - b.mark.offset);
  });

  // The measured input for one reflow: the marked blocks (inline margins included, sorted by visual
  // top), the measured marks (resolved to their blocks), and the sidenote heights. Blocks and marks
  // are written by one measure pass, so tops and margins share an epoch there.
  const measured = computed((): Measured => {
    const blocks = [...markedBlocks.value.entries()]
      .map(([blockKey, block]) => ({
        key: blockKey,
        top: block.top,
        height: block.height,
        margin: block.margin,
      }))
      .toSorted((a, b) => a.top - b.top);
    const marks = resolved.value
      .flatMap(({ thread_id: threadId, offset }) => {
        const markTop = positions.value.get(threadId);
        const blockKey = markBlocks.value.get(threadId);
        if (markTop === undefined || blockKey === undefined) return [];
        return [{ threadId, blockKey, top: markTop, offset }];
      })
      .toSorted((a, b) => a.top - b.top || a.offset - b.offset);
    return {
      blocks,
      marks: marks.map(({ threadId, blockKey, top }) => ({ threadId, blockKey, top })),
      sidenotes: resolved.value.map((mark) => ({
        threadId: mark.thread_id,
        height: heights.value.get(mark.thread_id) ?? 0,
      })),
    };
  });

  // The reflow: normalize the measured margins away, derive the block margins, then stack the
  // notes. Sidenote tops feed the column; the block margins park here until the apply step lands.
  const reflowed = computed((): Layout => new Layout(measured.value).normalize().reflow());
  const layout = computed((): ReadonlyMap<string, number> => reflowed.value.sidenoteTops);
  const margins = computed((): ReadonlyMap<NodeKey, number> => reflowed.value.margins);

  // Render slots: a slot per entry at its stacked top.
  const viewportLayout = computed((): SidenoteView[] =>
    entries.value.map((entry) => {
      const top = layout.value.get(entry.mark.thread_id) ?? entry.markTop;
      const height = heights.value.get(entry.mark.thread_id) ?? 0;
      return { key: entry.mark.thread_id, entry, top, height };
    }),
  );

  // Ghost: the nearest sidenote extending past this viewport edge (strict: at exact edge alignment
  // the regular sidenote wins and no ghost is mounted), with a measured height. Ghosts render
  // beneath real sidenotes, whose backgrounds occlude them where they overlap.
  const edgeGhost = (direction: "top" | "bottom"): GhostSidenoteView | undefined => {
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
    markBlocks,
    markedBlocks,
    heights,
    markOrdinals,
    entries,
    layout,
    margins,
    viewportLayout,
    topGhost,
    bottomGhost,
    markBadges,
    markRects,
  };
});

export type Sidenotes = InstanceType<typeof SidenotesModel>;
