import type { MarkFragmentRect } from "#/models/sidenotes.ts";

import type { MeasureContext } from "./domMeasure.ts";
import type { MarkFragment } from "./markGeometry.ts";

/**
 * Highlight rects for mark fragments: every line box of a fragment gets one rect per id it carries,
 * stacked by segment order, in column coordinates. Color resolution happens elsewhere, by thread
 * id. Fragments arrive in document order as the measure sweep guarantees.
 */
export function computeMarkFragmentRects(
  fragments: ReadonlyArray<MarkFragment>,
  ctx: MeasureContext,
): MarkFragmentRect[] {
  const { containerRect } = ctx;
  const rects: MarkFragmentRect[] = [];
  for (const { el, ids } of fragments) {
    for (const line of el.getClientRects()) {
      const left = line.left - containerRect.left;
      const top = line.top - containerRect.top;
      for (const [order, id] of ids.entries()) {
        rects.push({
          id,
          left,
          top,
          width: line.width,
          height: line.height,
          order,
          bandCount: ids.length,
        });
      }
    }
  }
  return rects;
}
