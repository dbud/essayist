import { $isCodeNode } from "@lexical/code";
import { $isListItemNode } from "@lexical/list";
import { $isHeadingNode } from "@lexical/rich-text";
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
