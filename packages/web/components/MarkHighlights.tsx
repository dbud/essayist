import type { MarkRect } from "@/signals/sidenotes.ts";

// Banded mark highlights as an overlay (pointer-events: none) over the editor,
// in the editor column's coordinate space. Mirrors MarkBadges' positioning
// approach: rendered inside the same `relative` column so it scrolls with
// content and re-measures only on content/resize/marks change -- never on
// scroll. Colors come from the per-id palette (see markColors.ts); the active
// set thickens/raises the matching bands.
//
// Painted behind the text: the editor column is an isolation stacking context
// (see FileViewer) and this overlay uses a negative z-index, so it sits above
// the column background but below the in-flow editor text -- the classic
// highlighter look. MarkBadges stays above the text (ordinal numbers).
export function MarkHighlights({
  rects,
  activeIds,
}: {
  rects: MarkRect[];
  activeIds: ReadonlySet<string>;
}) {
  if (rects.length === 0) return null;
  return (
    <div class="pointer-events-none absolute inset-0 -z-10">
      {rects.map(({ id, left, top, width, height, color }, i) => (
        <div
          key={i}
          class={`mark-band ${activeIds.has(id) ? "mark-band-active" : ""}`}
          style={`left:${left}px;top:${top}px;width:${width}px;height:${height}px;background-color:${color};color:${color}`}
        />
      ))}
    </div>
  );
}
