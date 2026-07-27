import type { Mark } from "@essayist/core";

/** A mark's span in markdown offset space, with its stable thread id. */
export type MarkSpan = Pick<Mark, "offset" | "length" | "thread_id">;

/**
 * A maximal non-overlapping interval covering part of the union of all mark
 * spans, together with the thread ids of every mark that covers it.
 *
 * Overlapping/nested marks become adjacent segments whose id-sets encode the
 * overlap, so the editor never has to nest `MarkNode`s -- it wraps each
 * segment in a single `MarkNode` carrying its id-set.
 */
export interface MarkSegment {
  offset: number;
  length: number;
  ids: string[];
}

/**
 * Splits a set of (possibly overlapping) mark spans into maximal
 * non-overlapping segments, each tagged with every thread id whose span covers
 * it. Zero-length spans are dropped. The result is sorted by offset, and each
 * segment's `ids` are ordered by the originating span's `(offset, -length,
 * thread_id)` so an outer/earlier mark is listed first.
 */
export function segmentMarks(marks: ReadonlyArray<MarkSpan>): MarkSegment[] {
  const spans: MarkSpan[] = [];
  const boundaries = new Set<number>();
  for (const m of marks) {
    if (m.length <= 0) continue;
    spans.push(m);
    boundaries.add(m.offset);
    boundaries.add(m.offset + m.length);
  }
  if (spans.length === 0) return [];

  // Deterministic id order within a segment: earlier offset first, then the
  // longer (outer) span first, then thread_id for a stable tiebreak.
  spans.sort((a, b) =>
    a.offset !== b.offset
      ? a.offset - b.offset
      : b.length - a.length ||
        (a.thread_id < b.thread_id ? -1 : a.thread_id > b.thread_id ? 1 : 0),
  );

  const points = Array.from(boundaries).sort((a, b) => a - b);

  const segments: MarkSegment[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const ids: string[] = [];
    for (const s of spans) {
      if (s.offset <= start && end <= s.offset + s.length) {
        ids.push(s.thread_id);
      }
    }
    if (ids.length > 0) {
      segments.push({ offset: start, length: end - start, ids });
    }
  }
  return segments;
}
