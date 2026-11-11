import { $isCodeNode } from "@lexical/code";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import {
  $getNodeByKey,
  $isParagraphNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";

import type { MarkBadge, MarkOrdinals } from "#/models/sidenotes.ts";

import { contentEndRect, hasRect, type MeasureContext } from "./domMeasure.ts";
import type { TrackedFragment } from "./sidenoteExtension.ts";

/**
 * Ordinal badges for mark fragments, applying the rightmost-per-block rule: within a block, a
 * mark's ordinal appears only on its last fragment there. A mark spanning multiple blocks still
 * badges once per block.
 */
export function computeMarkBadges(
  fragments: TrackedFragment[],
  ordinals: MarkOrdinals,
  editor: LexicalEditor,
  ctx: MeasureContext,
): MarkBadge[] {
  if (fragments.length === 0) return [];

  // Sort to document order so "next fragment in the same block" is defined.
  const ordered = fragments.toSorted(byDocumentPosition);

  // Pair each fragment with its block key, read from the live tree.
  const labeled = editor.getEditorState().read(() =>
    ordered.map((f) => {
      return { ids: f.ids, blockKey: $badgeBlockOf(f.key) };
    }),
  );

  const visible = visibleBadgeOrdinals(labeled, ordinals);

  const { containerRect, doc } = ctx;
  const badges: MarkBadge[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (visible[i].length === 0) continue;
    const { el, key } = ordered[i];
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

/**
 * Badge block of a node: the key of the nearest paragraph, heading, quote container, code block, or
 * list item. Quotes count as one badge block, so a mark crossing their inner paragraphs badges once
 * at the quote's visible end. A gone key or unrecognized structure falls back to the fragment's own
 * key, isolating it so dedup never suppresses across it. Badge dedup groups per visual container;
 * margins use `$marginBlockOf`, which recurses through quote and list containers to inner blocks.
 */
function $badgeBlockOf(key: NodeKey): NodeKey {
  const node = $getNodeByKey(key);
  if (node === null) return key;
  let n: LexicalNode | null = node.getParent();
  while (n !== null) {
    if (
      $isParagraphNode(n) ||
      $isHeadingNode(n) ||
      $isQuoteNode(n) ||
      $isCodeNode(n) ||
      $isListItemNode(n)
    ) {
      return n.getKey();
    }
    n = n.getParent();
  }
  // Unrecognized structure: isolate so we never suppress across it.
  return node.getKey();
}

function byDocumentPosition(a: TrackedFragment, b: TrackedFragment): number {
  if (a.el === b.el) return 0;
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}
