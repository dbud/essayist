import { $isMarkNode, type MarkNode } from "@lexical/mark";
import {
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
} from "lexical";

/**
 * The MarkNodes "at" the selection anchor, in priority order: the mark(s) on
 * the anchor's ancestor chain (innermost first), then any neighbouring mark
 * Lexical normalized the caret onto at a boundary (previous sibling at offset
 * 0, next sibling at offset textLength). Empty when the caret is in no mark.
 */
function $marksAtAnchor(): MarkNode[] {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return [];

  const anchor = selection.anchor;
  const node: LexicalNode | null = anchor.getNode();
  const marks: MarkNode[] = [];

  let current: LexicalNode | null = node;
  while (current !== null) {
    const mark: MarkNode | null = $findMatchingParent(current, $isMarkNode);
    if (mark === null) break;
    marks.push(mark);
    current = mark.getParent();
  }

  // Edges Lexical normalized to the adjacent text node.
  if ($isTextNode(node)) {
    const offset = anchor.offset;
    const size = node.getTextContentSize();
    if (offset === 0) {
      const prev = node.getPreviousSibling();
      if (prev !== null && $isMarkNode(prev)) marks.push(prev);
    }
    if (offset === size) {
      const next = node.getNextSibling();
      if (next !== null && $isMarkNode(next)) marks.push(next);
    }
  }

  return marks;
}

/** Mark thread ids active at the selection anchor (empty when unset). */
export function $markIdsAtAnchor(): Set<string> {
  const ids = new Set<string>();
  for (const mark of $marksAtAnchor()) {
    for (const id of mark.getIDs()) ids.add(id);
  }
  return ids;
}

/**
 * The innermost mark thread id at the anchor, or null when none. Segments
 * store ids outer-first / inner-last (see `segmentMarks`), so the innermost
 * mark is the last id on the innermost segment at the anchor.
 */
export function $innerMarkIdAtAnchor(): string | null {
  const [mark, _] = $marksAtAnchor();
  return mark === undefined ? null : lastId(mark);
}

function lastId(mark: MarkNode): string | null {
  const ids = mark.getIDs();
  return ids.length > 0 ? ids[ids.length - 1] : null;
}
