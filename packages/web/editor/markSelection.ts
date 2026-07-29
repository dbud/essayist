import { $isMarkNode, type MarkNode } from "@lexical/mark";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
} from "lexical";

/**
 * MarkNode ids on the selection anchor's ancestor chain (empty when unset).
 *
 * Lexical normalizes a caret sitting on the edge of a mark to the adjacent
 * text node: offset 0 when the caret is on the mark's right edge, or offset
 * textLength when on the left edge. We detect those adjacent positions and
 * treat the neighboring mark as active too.
 */
export function $markIdsAtAnchor(): Set<string> {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return new Set();

  const ids = new Set<string>();
  const anchor = selection.anchor;
  const node: LexicalNode | null = anchor.getNode();

  // Walk the anchor's ancestor chain.
  let current: LexicalNode | null = node;
  while (current !== null) {
    const mark: MarkNode | null = $findMatchingParent(current, $isMarkNode);
    if (mark === null) break;
    for (const id of mark.getIDs()) ids.add(id);
    current = mark.getParent();
  }

  // Detect caret edges adjacent to a mark that Lexical normalized away.
  if ($isTextNode(node)) {
    const offset = anchor.offset;
    const size = node.getTextContentSize();
    if (offset === 0) {
      const prev = node.getPreviousSibling();
      if (prev !== null && $isMarkNode(prev)) {
        for (const id of prev.getIDs()) ids.add(id);
      }
    }
    if (offset === size) {
      const next = node.getNextSibling();
      if (next !== null && $isMarkNode(next)) {
        for (const id of next.getIDs()) ids.add(id);
      }
    }
  }

  return ids;
}
