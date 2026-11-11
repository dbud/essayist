import type { Mark } from "@essayist/core";

import type { Categories } from "#/models/categories.ts";
import type { MarkFragmentRect } from "#/models/sidenotes.ts";

import type { MeasureContext } from "./domMeasure.ts";
import { assignBands } from "./markColors.ts";
import type { MarkFragment } from "./sidenoteExtension.ts";

/**
 * Highlight rects for mark fragments: every line box of a fragment gets one band per id it carries,
 * stacked in the band's draw order, in column coordinates. Fragments arrive in document order as
 * the measure sweep guarantees.
 */
export function computeMarkFragmentRects(
  fragments: ReadonlyArray<MarkFragment>,
  marks: ReadonlyArray<Mark>,
  categories: Categories,
  ctx: MeasureContext,
): MarkFragmentRect[] {
  const marksById = new Map(marks.map((m) => [m.thread_id, m] as const));
  const { containerRect } = ctx;
  const rects: MarkFragmentRect[] = [];
  for (const { el, ids } of fragments) {
    const bands = assignBands(marksById, ids, categories);
    if (bands.length === 0) continue;
    for (const line of el.getClientRects()) {
      const left = line.left - containerRect.left;
      const top = line.top - containerRect.top;
      for (const { id, color, order } of bands) {
        rects.push({
          id,
          color,
          left,
          top,
          width: line.width,
          height: line.height,
          order,
          bandCount: bands.length,
        });
      }
    }
  }
  return rects;
}
