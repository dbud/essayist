import type { MarkBadge, MarkOrdinals } from "#/models/sidenotes.ts";

import { contentEndRect, hasRect, type MeasureContext } from "./domMeasure.ts";
import type { TrackedFragment } from "./sidenoteExtension.ts";

/**
 * Ordinal badges for mark fragments, applying the rightmost-per-block rule: within a badge block,
 * a mark's ordinal appears only on its last fragment there. A mark spanning multiple blocks still
 * badges once per block. Fragments arrive in document order with their badge block keys resolved,
 * as the measure sweep guarantees.
 */
export function computeMarkBadges(
  fragments: TrackedFragment[],
  ordinals: MarkOrdinals,
  ctx: MeasureContext,
): MarkBadge[] {
  if (fragments.length === 0) return [];

  // "Next fragment in the same badge block" is defined by that document order.
  const labeled = fragments.map((f) => ({ ids: f.ids, blockKey: f.badgeBlockKey }));

  const visible = visibleBadgeOrdinals(labeled, ordinals);

  const { containerRect, doc } = ctx;
  const badges: MarkBadge[] = [];
  for (let i = 0; i < fragments.length; i++) {
    if (visible[i].length === 0) continue;
    const { el, key } = fragments[i];
    const rect = contentEndRect(el, doc);
    if (!hasRect(rect)) continue;
    badges.push({
      key,
      left: rect.right - containerRect.left,
      top: rect.top - containerRect.top,
      ordinals: visible[i],
    });
  }
  return badges;
}

/**
 * Per-fragment badge ordinals after the rightmost-per-block rule. `ordered` must be in document
 * order. A mark that continues into a same-block fragment is deferred to that later fragment; it's
 * kept on its last fragment per block. Ids without an ordinal are dropped.
 */
export function visibleBadgeOrdinals(
  ordered: ReadonlyArray<{ ids: string[]; blockKey: string }>,
  ordinals: MarkOrdinals,
): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < ordered.length; i++) {
    const { ids, blockKey } = ordered[i];
    const sameBlockAsNext = i + 1 < ordered.length && ordered[i + 1].blockKey === blockKey;
    const nextIds = sameBlockAsNext ? ordered[i + 1].ids : null;

    const visible: number[] = [];
    for (const id of ids) {
      if (nextIds?.includes(id)) continue;
      const n = ordinals.get(id);
      if (n !== undefined) visible.push(n);
    }
    visible.sort((a, b) => a - b);
    result.push(visible);
  }
  return result;
}
