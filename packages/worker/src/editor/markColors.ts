import type { Categories } from "#/models/categories.ts";
import type { MarkData } from "#/models/marks.data.ts";

export const FALLBACK_COLOR = "var(--color-ink)";

// The color of the category of a mark; ink for a mark without one.
export function colorForMark(mark: Pick<MarkData, "categoryId">, categories: Categories): string {
  return categories.categoryOf(mark)?.color ?? FALLBACK_COLOR;
}
