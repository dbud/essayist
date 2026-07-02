import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { $isListNode } from "@lexical/list";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
} from "@lexical/rich-text";
import {
  $createParagraphNode,
  $findMatchingParent,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical";

export type BlockType =
  | "normal"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "code"
  | "bullet"
  | "number";

/**
 * The block type at the selection anchor. Reads the current selection, so it
 * must run in a $-context (e.g. `editorState.read` or `editor.update`).
 */
export function $getBlockType(): BlockType {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return "normal";

  const anchor = selection.anchor.getNode();

  if ($findMatchingParent(anchor, $isCodeNode)) return "code";

  const list = $findMatchingParent(anchor, $isListNode);
  if (list !== null) {
    return list.getListType() === "number" ? "number" : "bullet";
  }

  const heading = $findMatchingParent(anchor, $isHeadingNode);
  if (heading !== null) {
    const tag = heading.getTag();
    if (tag === "h1" || tag === "h2" || tag === "h3") return tag;
    return "normal";
  }

  if ($findMatchingParent(anchor, $isQuoteNode)) return "quote";

  return "normal";
}

/**
 * Converts the content blocks (paragraph / heading / quote / code) within the
 * selection to `type`. List conversion is handled by Lexical's list commands,
 * not here. Runs in a $-context.
 */
export function $setBlocksType(
  type: "normal" | "h1" | "h2" | "h3" | "quote" | "code",
): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const seen = new Set<string>();
  const blocks: ElementNode[] = [];
  for (const node of selection.getNodes()) {
    const block = $contentBlockOf(node);
    if (block !== null && !seen.has(block.getKey())) {
      seen.add(block.getKey());
      blocks.push(block);
    }
  }

  for (const block of blocks) {
    if (type === "normal") {
      if (!$isParagraphNode(block)) block.replace($createParagraphNode(), true);
    } else if (type === "quote") {
      if (!$isQuoteNode(block)) block.replace($createQuoteNode(), true);
    } else if (type === "code") {
      if (!$isCodeNode(block)) block.replace($createCodeNode(), true);
    } else if (type === "h1" || type === "h2" || type === "h3") {
      if (!$isHeadingNode(block) || block.getTag() !== type) {
        block.replace($createHeadingNode(type), true);
      }
    }
  }
}

/** Nearest ancestor (or self) that is a leaf content block. */
function $contentBlockOf(node: LexicalNode): ElementNode | null {
  let n: LexicalNode | null = node;
  while (n !== null) {
    if (
      $isParagraphNode(n) ||
      $isHeadingNode(n) ||
      $isQuoteNode(n) ||
      $isCodeNode(n)
    ) {
      return $isElementNode(n) ? n : null;
    }
    n = n.getParent();
  }
  return null;
}
