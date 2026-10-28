import type { MarkRect } from "#/models/sidenotes.ts";

/** Shared input for a highlight renderer (band, wavy, underline, ...). */
export interface HighlightRendererProps {
  rects: MarkRect[];
  activeIds: ReadonlySet<string>;
  innerId: string | null;
}
