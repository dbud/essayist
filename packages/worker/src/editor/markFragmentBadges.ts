import type { MarkFragmentBadge, MarkOrdinals } from "#/models/sidenotes.ts";

import { contentEndRect, hasRect, type MeasureContext } from "./domMeasure.ts";
import type { MarkFragment } from "./markGeometry.ts";

/**
 * Ordinal badges for mark fragments, applying the rightmost-per-block rule: each fragment's badge
 * lists the ordinals of the marks that end there, ascending. Fragments arrive in document order
 * with their badge block keys resolved, as the measure sweep guarantees.
 */
export function computeMarkFragmentBadges(
  fragments: MarkFragment[],
  ordinals: MarkOrdinals,
  ctx: MeasureContext,
): MarkFragmentBadge[] {
  if (fragments.length === 0) return [];

  const fragmentEndingIds = endingIds(fragments);

  const { containerRect, doc } = ctx;
  const badges: MarkFragmentBadge[] = [];
  for (let i = 0; i < fragments.length; i++) {
    const badgeOrdinals = ordinalsFor(fragmentEndingIds[i], ordinals);
    if (badgeOrdinals.length === 0) continue;
    const { el, key } = fragments[i];
    const rect = contentEndRect(el, doc);
    if (!hasRect(rect)) continue;
    badges.push({
      key,
      left: rect.right - containerRect.left,
      top: rect.top - containerRect.top,
      ordinals: badgeOrdinals,
    });
  }
  return badges;
}

/**
 * Per fragment, the ids whose badge sits there: an id shows on the last fragment of its badge
 * block, so each id survives only when the next fragment of the same badge block stops carrying
 * it. `fragments` must be in document order; same-mark fragments of a block are contiguous in that
 * order, so one neighbor step decides.
 */
export function endingIds(fragments: ReadonlyArray<MarkFragment>): string[][] {
  const result: string[][] = [];
  for (let i = 0; i < fragments.length; i++) {
    const { ids, badgeBlockKey } = fragments[i];
    const next = fragments[i + 1];
    const continues = next !== undefined && next.badgeBlockKey === badgeBlockKey ? next.ids : null;
    result.push(ids.filter((id) => !continues?.includes(id)));
  }
  return result;
}

// Ordinals for a fragment's ids, ascending, dropping ids without an ordinal.
export function ordinalsFor(ids: readonly string[], ordinals: MarkOrdinals): number[] {
  return ids
    .map((id) => ordinals.get(id))
    .filter((n): n is number => n !== undefined)
    .toSorted((a, b) => a - b);
}
