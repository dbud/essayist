import type { Mark } from "@essayist/core";

// Color + band-order policy for overlapping marks. `colorForMark` takes the
// whole mark so the derivation can change (e.g. to mark.category) without
// touching call sites; it hashes thread_id (stable across versions) today.

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
function colorForKey(key: string): string {
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return MARK_PALETTE[Math.abs(h) % MARK_PALETTE.length];
}

export function colorForMark(mark: Mark): string {
  return colorForKey(mark.thread_id);
}

export interface MarkBand {
  id: string;
  color: string;
  order: number;
}

/**
 * Color + band order for each id in a segment. `ids` are thread ids in segment
 * order (outer/earliest mark first -> band 0). A missing mark (transient) falls
 * back to hashing the thread id, which matches the current derivation.
 */
export function assignBands(
  marks: ReadonlyMap<string, Mark>,
  ids: readonly string[],
): MarkBand[] {
  return ids.map((id, order) => {
    const mark = marks.get(id);
    return { id, color: mark ? colorForMark(mark) : colorForKey(id), order };
  });
}
