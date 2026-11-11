import type { Box } from "./span.ts";

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
