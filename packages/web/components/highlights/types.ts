import type { MarkRect } from "@/signals/sidenotes.ts";

/** Shared input for a highlight renderer (band, wavy, underline, ...). */
export interface HighlightRendererProps {
  rects: MarkRect[];
  activeIds: ReadonlySet<string>;
}
