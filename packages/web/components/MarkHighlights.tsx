import { BandRenderer } from "@/components/highlights/BandRenderer.tsx";
import type { HighlightRendererProps } from "@/components/highlights/types.ts";
import { WavyRenderer } from "@/components/highlights/WavyRenderer.tsx";
import { highlightStyle } from "@/signals/preferences.ts";

// Mark highlight overlay. Bands tint behind the text (negative z). Wavy
// strokes ride the line-box bottom and paint above the text so they stay
// visible over the native selection highlight.
export function MarkHighlights({
  rects,
  activeIds,
  innerId,
}: HighlightRendererProps) {
  if (rects.length === 0) return null;
  return (
    <div
      class={`pointer-events-none absolute inset-0 ${
        highlightStyle.value === "wavy" ? "z-mark-wavy" : "z-mark"
      }`}
    >
      {highlightStyle.value === "wavy" ? (
        <WavyRenderer rects={rects} activeIds={activeIds} innerId={innerId} />
      ) : (
        <BandRenderer rects={rects} activeIds={activeIds} innerId={innerId} />
      )}
    </div>
  );
}
