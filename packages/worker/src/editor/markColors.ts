import type { Mark } from "@essayist/core";

import type { Categories } from "#/models/categories.ts";

export const FALLBACK_COLOR = "var(--color-ink)";

// The category color for a mark's label; ink when the label has no category.
export function colorForMark(mark: Mark, categories: Categories): string {
  const category = categories.byLabel.value.get(mark.label ?? "");
  return category?.color ?? FALLBACK_COLOR;
}
