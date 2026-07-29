import {
  $isMarkNode,
  MarkNode as BaseMarkNode,
  type SerializedMarkNode,
} from "@lexical/mark";
import {
  $applyNodeReplacement,
  $findMatchingParent,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type RangeSelection,
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
    const mark: BaseMarkNode | null = $findMatchingParent(current, $isMarkNode);
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

const NO_IDS: readonly string[] = [];

export class MarkNode extends BaseMarkNode {
  static override getType(): string {
    return "mark";
  }

  static override clone(node: MarkNode): MarkNode {
    return new MarkNode(node.__ids, node.__key);
  }

  static override importJSON(serializedNode: SerializedMarkNode): MarkNode {
    return $createMarkNode().updateFromJSON(serializedNode);
  }

  override insertNewAfter(
    _selection: RangeSelection,
    restoreSelection = true,
  ): MarkNode {
    const markNode = $createMarkNode(this.__ids);
    this.insertAfter(markNode, restoreSelection);
    return markNode;
  }
}

export function $createMarkNode(ids: readonly string[] = NO_IDS): MarkNode {
  return $applyNodeReplacement(new MarkNode(ids));
}
