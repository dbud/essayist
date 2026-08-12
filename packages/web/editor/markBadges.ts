import { $isCodeNode } from "@lexical/code";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import {
  $getNodeByKey,
  $isParagraphNode,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import type { MarkBadge, MarkNumbers } from "@/signals/sidenotes.ts";
import { contentEndRect, hasRect, type MeasureContext } from "./domMeasure.ts";
import type { TrackedFragment } from "./trackNodePositions.ts";

/**
 * Ordinal badges for mark fragments, applying the rightmost-per-block
 * rule: within a block, a mark's number appears only on its last fragment
 * there. A mark spanning multiple blocks still badges once per block.
 */
export function computeMarkBadges(
  fragments: TrackedFragment[],
  numbers: MarkNumbers,
  editor: LexicalEditor,
  ctx: MeasureContext,
): MarkBadge[] {
  if (fragments.length === 0) return [];

  // Sort to document order so "next fragment in the same block" is defined.
  const ordered = [...fragments].sort(byDocumentPosition);

  // Pair each fragment with its block key, read from the live tree.
  const labeled = editor.getEditorState().read(() =>
    ordered.map((f) => {
      const node = $getNodeByKey(f.key);
      return { ids: f.ids, blockKey: node === null ? f.key : blockKeyOf(node) };
    }),
  );

  const visible = visibleBadgeNumbers(labeled, numbers);

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
      numbers: visible[i],
    });
  }
  return badges;
}

/**
 * Per-fragment badge ordinals after the rightmost-per-block rule. `ordered`
 * must be in document order. A mark that continues into a same-block fragment
 * is deferred to that later fragment; it's kept on its last fragment per block.
 * Ids without an ordinal are dropped.
 */
export function visibleBadgeNumbers(
  ordered: ReadonlyArray<{ ids: string[]; blockKey: string }>,
  numbers: MarkNumbers,
): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < ordered.length; i++) {
    const { ids, blockKey } = ordered[i];
    const sameBlockAsNext =
      i + 1 < ordered.length && ordered[i + 1].blockKey === blockKey;
    const nextIds = sameBlockAsNext ? ordered[i + 1].ids : null;

    const visible: number[] = [];
    for (const id of ids) {
      if (nextIds?.includes(id)) continue;
      const n = numbers.get(id);
      if (n !== undefined) visible.push(n);
    }
    visible.sort((a, b) => a - b);
    result.push(visible);
  }
  return result;
}

/** Block key of a node: nearest leaf block ancestor, else the node itself. */
function blockKeyOf(node: LexicalNode): string {
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
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}
