import type { MarkFragmentRect } from "#/models/sidenotes.ts";

/** Shared input for a highlight renderer (band, wavy, underline, ...). */
export interface HighlightRendererProps {
  rects: MarkFragmentRect[];
  /** mark id -> category color for the mark's label; ids missing from the map (transient
   * fragments) render in ink. */
  colorById: ReadonlyMap<string, string>;
  activeIds: ReadonlySet<string>;
  innerId: string | null;
}
