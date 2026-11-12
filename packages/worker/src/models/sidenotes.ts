import type { Mark } from "@essayist/core";
import { type Signal, computed, createModel, signal } from "@preact/signals";
import { sortBy } from "@std/collections";
import type { NodeKey } from "lexical";

import { FALLBACK_COLOR, colorForMark } from "#/editor/markColors.ts";
import {
  Layout,
  type Measured,
  type MeasuredMarks,
  type MeasuredSidenotes,
} from "#/geometry/layout.ts";
import type { Categories } from "#/models/categories.ts";
import { FileKey } from "#/models/fileSelection.ts";
import type { ResolvedMarks } from "#/models/resolvedMarks.ts";
import { getEditorSelection } from "#/signals/editorSelection.ts";

import { deepComputed } from "./utils/deepComputed.ts";

// mark id -> the line top where the mark anchors.
export type SidenotePositions = Map<string, number>;
// mark id -> rendered sidenote height (px).
export type SidenoteHeights = Map<string, number>;
// mark id -> 1-based ordinal in document order (by mark.offset).
export type MarkOrdinals = Map<string, number>;

export interface MarkFragmentTop {
  ids: ReadonlyArray<string>;
  top: number;
}

export interface MarkAnchorTop {
  id: string;
  top: number;
}

export interface MarkFragmentBadge {
  key: NodeKey;
  left: number; // end-x of the fragment text, relative to the editor column
  top: number; // line top at that end, relative to the editor column
  ordinals: number[]; // ordinals of the marks covering this fragment, ascending
}

// A highlight band for one mark id and line box. Overlapping ids each get their own band per line.
export interface MarkFragmentRect {
  id: string; // mark id this band belongs to
  left: number; // relative to the editor column
  top: number; // relative to the editor column
  width: number;
  height: number; // visual line box height
  order: number; // band index within the line (0 = topmost mark)
  bandCount: number; // bands on this line
}

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

export interface SidenoteView extends SidenoteViewBase {
  top: number;
  height: number; // measured height, 0 while unmeasured
}

// An offscreen ghost pinned to a viewport edge by the CSS in GhostSidenote.
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
 * Sidenote presentation for a file. The editor extension writes the measured mark data, the
 * badges, and the rects; the Sidenotes column writes the heights; everything else derives here.
 * Per (workspace, path, version) so each file and view keeps its own measured state. `entries` only
 * includes measured marks.
 */
export const SidenotesModel = createModel((key: FileKey, deps: SidenotesDeps) => {
  const { resolvedMarks, categories, scrollTop, viewportHeight } = deps;
  const measuredMarks = signal<MeasuredMarks>({
    blocks: [],
    blocksByMarkId: new Map(),
    marks: [],
  });
  const heights = signal<SidenoteHeights>(new Map());
  const markFragmentBadges = signal<MarkFragmentBadge[]>([]);
  const markFragmentRects = signal<MarkFragmentRect[]>([]);

  const { resolved } = resolvedMarks;
  const { markIds: activeMarkIds } = getEditorSelection(key);

  // Shared by the editor badges and the sidenote column.
  const markOrdinals = computed(
    (): MarkOrdinals =>
      new Map(sortBy(resolved.value, (m) => m.offset).map((m, i) => [m.id, i + 1] as const)),
  );

  // mark id -> the category color of each mark, for its label and highlight bands.
  const colorById = computed(
    () => new Map(resolved.value.map((m) => [m.id, colorForMark(m, categories)])),
  );

  // Unmeasured cards read 0, so a mark keeps its stacking slot until its height lands.
  const measuredSidenotes = computed((): MeasuredSidenotes => ({
    sidenotes: resolved.value.map(({ id }) => ({
      id,
      height: heights.value.get(id) ?? 0,
    })),
  }));

  const measured = deepComputed((): Measured => ({
    ...measuredMarks.value,
    ...measuredSidenotes.value,
  }));

  const reflowed = computed((): Layout => new Layout(measured.value).normalize().reflow());
  const layout = deepComputed((): ReadonlyMap<string, number> => reflowed.value.sidenoteTops);
  const margins = deepComputed((): ReadonlyMap<NodeKey, number> => reflowed.value.margins);

  const entries = deepComputed((): SidenoteEntry[] => {
    const out: SidenoteEntry[] = [];
    for (const mark of resolved.value) {
      const markTop = measuredMarks.value.marks.find((m) => m.id === mark.id)?.top;
      if (markTop === undefined) continue; // not yet measured
      out.push({
        mark,
        markTop,
        ordinal: markOrdinals.value.get(mark.id) ?? 0,
        active: activeMarkIds.value.has(mark.id),
        color: colorById.value.get(mark.id) ?? FALLBACK_COLOR,
      });
    }
    return out.toSorted((a, b) => a.markTop - b.markTop || a.mark.offset - b.mark.offset);
  });

  // Marks the layout did not pair with a block fall back to their own top.
  const viewportLayout = deepComputed((): SidenoteView[] =>
    entries.value.map((entry) => {
      const top = layout.value.get(entry.mark.id) ?? entry.markTop;
      const height = heights.value.get(entry.mark.id) ?? 0;
      return { key: entry.mark.id, entry, top, height };
    }),
  );

  // The nearest sidenote extending past this viewport edge, with a measured height. Strict:
  // at exact alignment the real sidenote wins and no ghost mounts. Ghosts render beneath real
  // sidenotes, which hide them where they overlap.
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
      key: `${entry.mark.id}:ghost-${direction}`,
      entry,
      trueTop: top,
      ghost: direction,
    };
  };

  const topGhost = computed(() => edgeGhost("top"));
  const bottomGhost = computed(() => edgeGhost("bottom"));

  return {
    measuredMarks,
    heights,
    markOrdinals,
    colorById,
    entries,
    layout,
    margins,
    viewportLayout,
    topGhost,
    bottomGhost,
    markFragmentBadges,
    markFragmentRects,
  };
});

export type Sidenotes = InstanceType<typeof SidenotesModel>;
