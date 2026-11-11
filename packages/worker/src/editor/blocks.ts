import { $isCodeNode } from "@lexical/code";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode } from "@lexical/rich-text";
import type { LexicalNode } from "lexical";
import { $isParagraphNode } from "lexical";

// The blocks that can take a calculated top margin to align their marks with their sidenotes. Quote
// and list containers are passed through; the walk stops at their inner blocks.
function $isLeafBlock(node: LexicalNode): boolean {
  return (
    $isParagraphNode(node) || $isHeadingNode(node) || $isCodeNode(node) || $isListItemNode(node)
  );
}

// The nearest leaf block containing the node; null when the node has none (a bare child of the
// editor root).
export function $leafBlockOf(node: LexicalNode | null): LexicalNode | null {
  let current: LexicalNode | null = node;
  while (current !== null && !$isLeafBlock(current)) current = current.getParent();
  return current;
}
