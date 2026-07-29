// Color + band-order policy for overlapping marks.
//
// Today there are no categories, so color is derived deterministically from
// each mark's thread id (hash -> palette index) and band order is the id order
// already produced by `segmentMarks` (outer/earliest mark first). Both policies
// live here so that when categories arrive, swapping to category-based color
// and priority ordering is a one-file change.

// CSS custom property names; values are defined in `assets/styles.css`.
export const MARK_PALETTE = [
  "var(--color-mark-0)",
  "var(--color-mark-1)",
  "var(--color-mark-2)",
  "var(--color-mark-3)",
  "var(--color-mark-4)",
  "var(--color-mark-5)",
] as const;

// djb2 -- stable, small, good enough distribution for palette assignment.
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForId(id: string): string {
  return MARK_PALETTE[hashId(id) % MARK_PALETTE.length];
}

export interface MarkBand {
  id: string;
  color: string;
  order: number;
}

/**
 * Assigns a color and band order to each id in a segment. `ids` must arrive in
 * segment order (as produced by `segmentMarks` / `MarkNode.getIDs`); band 0 is
 * the top band.
 */
export function assignBands(ids: readonly string[]): MarkBand[] {
  return ids.map((id, order) => ({ id, color: colorForId(id), order }));
}
