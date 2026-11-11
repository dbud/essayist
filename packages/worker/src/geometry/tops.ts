import type { Box } from "./span.ts";

/**
 * The column position of each mark: the minimum fragment top per thread id (a mark spanning a
 * paragraph break yields several fragments sharing its ids; the minimum aligns to the mark's first
 * line), then zero-length anchors fill the ids without a fragment.
 */
export function markTops(
  fragments: ReadonlyArray<{ ids: ReadonlyArray<string>; top: number }>,
  anchors: ReadonlyArray<{ id: string; top: number }>,
): Map<string, number> {
  const tops = new Map<string, number>();
  for (const { ids, top } of fragments) {
    for (const id of ids) {
      const prev = tops.get(id);
      if (prev === undefined || top < prev) tops.set(id, top);
    }
  }
  for (const { id, top } of anchors) {
    if (!tops.has(id)) tops.set(id, top);
  }
  return tops;
}

export function stackTops(boxes: readonly Box[], gap: number): number[] {
  // oxlint-disable-next-line unicorn/no-new-array -- preallocated, filled by index below
  const out = new Array<number>(boxes.length);
  let prevBottom = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < boxes.length; i++) {
    const top = Math.max(boxes[i].top, prevBottom + gap);
    out[i] = top;
    prevBottom = top + boxes[i].height;
  }
  return out;
}
