import type { Mark } from "@essayist/core";
import { type Signal, computed, createModel, signal } from "@preact/signals";
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
// mark id -> 1-based ordinal in the measured order.
export type MarkOrdinals = Map<string, number>;

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
  const measuredMarks = signal<MeasuredMarks>({ blocks: [] });
  const heights = signal<SidenoteHeights>(new Map());
  const markFragmentBadges = signal<MarkFragmentBadge[]>([]);
  const markFragmentRects = signal<MarkFragmentRect[]>([]);

  const { resolved } = resolvedMarks;
  const { markIds: activeMarkIds } = getEditorSelection(key);

  const marks = computed(() => measuredMarks.value.blocks.flatMap((block) => block.marks));

  const markOrdinals = computed((): MarkOrdinals => {
    const ordinals = new Map<string, number>();
    let next = 1;
    for (const { id } of marks.value) {
      if (!ordinals.has(id)) ordinals.set(id, next++);
    }
    return ordinals;
  });

  // mark id -> the category color of each mark, for its label and highlight bands.
  const colorById = computed(
    () => new Map(resolved.value.map((m) => [m.id, colorForMark(m, categories)])),
  );

  // Unmeasured cards read 0, so a mark keeps its stacking slot until its height is measured.
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

  const layout = computed((): Layout => new Layout(measured.value));
  const sidenoteTops = deepComputed((): ReadonlyMap<string, number> => layout.value.sidenoteTops);
  const margins = deepComputed((): ReadonlyMap<NodeKey, number> => layout.value.margins);

  const entries = deepComputed((): SidenoteEntry[] => {
    const byId = new Map(resolved.value.map((mark) => [mark.id, mark]));
    return marks.value.flatMap(({ id, top }) => {
      const mark = byId.get(id);
      if (mark === undefined) return [];
      return [
        {
          mark,
          markTop: top,
          ordinal: markOrdinals.value.get(id) ?? 0,
          active: activeMarkIds.value.has(id),
          color: colorById.value.get(id) ?? FALLBACK_COLOR,
        },
      ];
    });
  });

  const views = deepComputed((): SidenoteView[] =>
    entries.value.flatMap((entry) => {
      const top = sidenoteTops.value.get(entry.mark.id);
      if (top === undefined) return [];
      return [{ key: entry.mark.id, entry, top, height: heights.value.get(entry.mark.id) ?? 0 }];
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
    const candidate =
      direction === "bottom"
        ? views.value.find((v) => v.top + v.height > vBottom)
        : views.value.findLast((v) => v.top < vTop);
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
    margins,
    views,
    topGhost,
    bottomGhost,
    markFragmentBadges,
    markFragmentRects,
  };
});

export type Sidenotes = InstanceType<typeof SidenotesModel>;
