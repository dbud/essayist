import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";
import type { LexicalEditor, LexicalNode, TextNode } from "lexical";
import { $getRoot, $isElementNode, $isTextNode } from "lexical";

/**
 * A position within a specific Lexical TextNode.
 */
export interface NodePosition {
  key: string;
  offset: number;
}

/**
 * A range between two NodePositions, suitable for creating a RangeSelection.
 */
export interface NodeRange {
  anchor: NodePosition;
  focus: NodePosition;
}

/**
 * An entry mapping a TextNode to its position in the exported markdown.
 */
export interface TextNodeSpan {
  key: string;
  text: string;
  mdStart: number;
}

/**
 * Result of building the markdown-to-node mapping.
 * The spans list is sorted by markdown position, enabling binary search.
 */
export interface MarkdownMapping {
  spans: TextNodeSpan[];
  /** The full exported markdown string */
  markdown: string;
}

/**
 * Builds a sorted list of TextNode spans from the editor state.
 *
 * Exports the editor to markdown, then walks all TextNodes in document
 * order, finding each one's text in the exported markdown. The resulting
 * list is sorted by markdown position, enabling O(log n) binary search
 * for mark offset lookup.
 */
export function buildMarkdownMapping(editor: LexicalEditor): MarkdownMapping {
  const spans: TextNodeSpan[] = [];
  let markdown = "";

  editor.getEditorState().read(() => {
    const root = $getRoot();
    // TODO: investigate "The selection is moved to the start after the operation."
    markdown = $convertToMarkdownString(TRANSFORMERS, root);

    let searchFrom = 0;
    for (const tn of walkTextNodes(root)) {
      const text = tn.getTextContent();
      if (text.length === 0) continue;

      const idx = markdown.indexOf(text, searchFrom);
      if (idx === -1) continue;

      spans.push({ key: tn.getKey(), text, mdStart: idx });
      searchFrom = idx + text.length;
    }
  });

  return { spans, markdown };
}

/**
 * Finds the TextNode and local offset for a given markdown character offset.
 * Uses binary search on the sorted spans — O(log n).
 *
 * If the offset falls in a gap between TextNodes (e.g., markdown syntax
 * characters like #, >, **), snaps to the nearest valid text position:
 * either the end of the preceding span or the start of the following span.
 */
export function findPosition(
  spans: TextNodeSpan[],
  mdOffset: number,
): NodePosition | null {
  if (spans.length === 0) return null;

  let lo = 0;
  let hi = spans.length - 1;
  let candidate: number | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (spans[mid].mdStart <= mdOffset) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate === null) {
    // Offset is before all spans — snap to start of first span
    return { key: spans[0].key, offset: 0 };
  }

  const span = spans[candidate];
  const localOffset = mdOffset - span.mdStart;

  if (localOffset < span.text.length) {
    return { key: span.key, offset: localOffset };
  }

  // Offset is past the end of this span — it's in a gap.
  // Snap to the start of the next span, or the end of this one.
  if (candidate + 1 < spans.length) {
    return { key: spans[candidate + 1].key, offset: 0 };
  }

  // No next span — snap to end of this span
  return { key: span.key, offset: span.text.length - 1 };
}

/**
 * Converts a markdown offset range to a NodeRange.
 * Returns null only if there are no spans at all.
 */
export function findRange(
  spans: TextNodeSpan[],
  mdOffset: number,
  length: number,
): NodeRange | null {
  // findPosition never returns null when spans is non-empty
  const anchor = findPosition(spans, mdOffset);
  if (!anchor) return null;

  const focus = findPosition(spans, mdOffset + length - 1);
  if (!focus) return null;

  return { anchor, focus };
}

function* walkTextNodes(node: LexicalNode): Generator<TextNode> {
  if ($isTextNode(node)) {
    yield node;
  } else if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      yield* walkTextNodes(child);
    }
  }
}
