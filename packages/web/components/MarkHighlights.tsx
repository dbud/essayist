import { BandRenderer } from "@/components/highlights/BandRenderer.tsx";
import type { HighlightRendererProps } from "@/components/highlights/types.ts";

// Mark highlight overlay over the editor, in the editor column's coordinate
// space. Painted behind the text via a negative z-index; MarkBadges stays
// above the text. Owns the overlay container -- the shapes are drawn by a
// renderer (BandRenderer today); alternatives plug in here without touching
// the contentEditable.
export function MarkHighlights({ rects, activeIds }: HighlightRendererProps) {
  if (rects.length === 0) return null;
  return (
    <div class="pointer-events-none absolute inset-0 z-mark">
      <BandRenderer rects={rects} activeIds={activeIds} />
    </div>
  );
}
