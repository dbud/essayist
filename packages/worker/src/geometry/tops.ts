import type { MarkFragment, ZeroLengthMarkAnchor } from "#/editor/markGeometry.ts";

import type { Box } from "./span.ts";

/** A mark's column position: the top of its anchored line and that line's block. */
export interface MarkPosition {
  top: number;
  blockKey: string | null;
}

/**
 * Per mark, the position of its anchored line: the smallest fragment top and that fragment's block.
 * A mark spanning paragraphs pairs with its first block, where its first line lives. Zero-length
 * anchors fill the marks without fragments.
 */
export function markTops(
  fragments: ReadonlyArray<MarkFragment>,
  anchors: ReadonlyArray<ZeroLengthMarkAnchor>,
): Map<string, MarkPosition> {
  const tops = new Map<string, MarkPosition>();
  for (const { ids, top, marginBlockKey } of fragments) {
    for (const id of ids) {
      const pos = tops.get(id);
      if (pos === undefined || top < pos.top) {
        tops.set(id, { top, blockKey: marginBlockKey });
      }
    }
  }
  for (const { id, top, marginBlockKey } of anchors) {
    if (!tops.has(id)) tops.set(id, { top, blockKey: marginBlockKey });
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
