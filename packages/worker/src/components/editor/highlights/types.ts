import type { MarkFragmentRect } from "#/models/sidenotes.ts";

/** Shared input for a highlight renderer (band, wavy, underline, ...). */
export interface HighlightRendererProps {
  rects: MarkFragmentRect[];
  activeIds: ReadonlySet<string>;
  innerId: string | null;
}
