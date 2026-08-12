import type { HighlightRendererProps } from "./types.ts";

// Translucent colored band behind each marked line segment, stacked per
// overlapping mark. Active id gets a higher opacity (.mark-band / .is-active).
export function BandRenderer({ rects, activeIds }: HighlightRendererProps) {
  return (
    <>
      {rects.map(
        ({ id, color, left, top, width, height, order, bandCount }, i) => {
          const bandHeight = height / bandCount;
          return (
            <div
              key={i}
              class={`mark-band ${activeIds.has(id) ? "is-active" : ""}`}
              style={{
                left,
                top: top + order * bandHeight,
                width,
                height: bandHeight,
                backgroundColor: color,
                color,
              }}
            />
          );
        },
      )}
    </>
  );
}
