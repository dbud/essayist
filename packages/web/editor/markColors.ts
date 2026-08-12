import type { Mark } from "@essayist/core";

// Color + band-order policy for overlapping marks. `colorForMark` takes the
// whole mark so the derivation can change (e.g. to mark.category).

// Palette: oklch() with per-slot hue + --mark-l/--mark-c knobs. Knobs are set
// per scope in marks.css (.mark-band, .mark-wavy), so colors resolve per scope.
export const MARK_PALETTE = [
  "oklch(var(--mark-l) var(--mark-c) 90)",
  "oklch(var(--mark-l) var(--mark-c) 130)",
  "oklch(var(--mark-l) var(--mark-c) 160)",
  "oklch(var(--mark-l) var(--mark-c) 260)",
  "oklch(var(--mark-l) var(--mark-c) 300)",
  "oklch(var(--mark-l) var(--mark-c) 355)",
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
