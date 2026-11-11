import { $isCodeNode } from "@lexical/code";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode, $isQuoteNode } from "@lexical/rich-text";
import type { LexicalNode, NodeKey } from "lexical";
import { $getNodeByKey, $isParagraphNode } from "lexical";

// The blocks that can take a calculated top margin to align their marks with their sidenotes. Quote
// and list containers are passed through; the walk stops at their inner blocks.
function $isMarginBlock(node: LexicalNode): boolean {
  return (
    $isParagraphNode(node) || $isHeadingNode(node) || $isCodeNode(node) || $isListItemNode(node)
  );
}

// The key of the nearest margin block containing the node behind `key`, or null when the key is
// gone or the node sits outside any margin block (a bare child of the editor root).
export function $marginBlockOf(key: NodeKey): NodeKey | null {
  let current: LexicalNode | null = $getNodeByKey(key);
  while (current !== null && !$isMarginBlock(current)) current = current.getParent();
  return current?.getKey() ?? null;
}

// The key of the nearest badge block containing the node behind `key`: the nearest paragraph,
// heading, quote container, code block, or list item. Quotes count as one badge block, so a mark
// crossing their inner paragraphs badges once at the quote's visible end. Badge dedup groups per
// visual container; `$marginBlockOf` instead recurses through quote and list containers to the
// inner blocks its margins target. A gone key or unrecognized structure falls back to the given
// key, isolating the fragment so dedup never suppresses across it.
export function $badgeBlockOf(key: NodeKey): NodeKey {
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
  return node.getKey();
}
