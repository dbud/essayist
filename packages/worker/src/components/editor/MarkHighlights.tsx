import { usePreferences } from "#/models/preferences.ts";

import { BandRenderer } from "./highlights/BandRenderer.tsx";
import type { HighlightRendererProps } from "./highlights/types.ts";
import { WavyRenderer } from "./highlights/WavyRenderer.tsx";

// Mark highlight overlay. Bands tint behind the text (negative z). Wavy strokes ride the line-box
// bottom and paint above the text so they stay visible over the native selection highlight.
export function MarkHighlights({ rects, activeIds, innerId }: HighlightRendererProps) {
  const { highlightStyle } = usePreferences();
  if (rects.length === 0) return null;
  return (
    <div
      class={`pointer-events-none absolute inset-0 ${highlightStyle.value === "wavy" ? "z-mark-wavy" : "z-mark"}`}
    >
      {highlightStyle.value === "wavy" ? (
        <WavyRenderer rects={rects} activeIds={activeIds} innerId={innerId} />
      ) : (
        <BandRenderer rects={rects} activeIds={activeIds} innerId={innerId} />
      )}
    </div>
  );
}
