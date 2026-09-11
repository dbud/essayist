import type { Mark } from "@essayist/core";
import { getCategories } from "@/signals/categories.ts";

export const FALLBACK_COLOR = "var(--color-ink)";

export function colorForMark(mark: Mark): string {
  const category = getCategories().byLabel.value.get(mark.label ?? "");
  return category?.color ?? FALLBACK_COLOR;
}

export interface MarkBand {
  id: string;
  color: string;
  order: number;
}

/**
 * Color + band order for each id in a segment. `ids` are thread ids in segment
 * order (outer/earliest mark first -> band 0). A missing mark (transient) has
 * no label, so it falls back to ink.
 */
export function assignBands(
  marks: ReadonlyMap<string, Mark>,
  ids: readonly string[],
): MarkBand[] {
  return ids.map((id, order) => {
    const mark = marks.get(id);
    return { id, color: mark ? colorForMark(mark) : FALLBACK_COLOR, order };
  });
}
