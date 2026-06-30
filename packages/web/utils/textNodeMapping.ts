import { assert } from "@std/assert/assert";
import type { EditorState, LexicalNode, TextNode } from "lexical";
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
 * An entry mapping a TextNode to its position in the exported text.
 */
export interface TextNodeSpan {
  key: string;
  text: string;
  offset: number;
}

export interface Span {
  offset: number;
  length: number;
}

/**
 * Builds a sorted list of TextNode spans from the editor state.
 *
 * Exports the editor to markdown, then walks all TextNodes in document
 * order, finding each one's text in the exported markdown. The resulting
 * list is sorted by markdown position, enabling O(log n) binary search
 * for mark offset lookup.
 */
export function buildTextNodeSpans(
  state: EditorState,
  content: string,
): TextNodeSpan[] {
  const spans: TextNodeSpan[] = [];

  state.read(() => {
    const root = $getRoot();

    let searchFrom = 0;
    for (const tn of walkTextNodes(root)) {
      const text = tn.getTextContent();
      if (text.length === 0) continue;

      const idx = content.indexOf(text, searchFrom);
      if (idx === -1) continue;

      spans.push({ key: tn.getKey(), text, offset: idx });
      searchFrom = idx + text.length;
    }
  });

  return spans;
}

/**
 * Finds the TextNode and local offset for a given content character offset.
 * Uses binary search on the sorted spans — O(log n).
 *
 * If the offset falls in a gap between TextNodes (e.g., markdown syntax
 * characters like #, >, **), snaps to the nearest valid text position:
 * either the end of the preceding span or the start of the following span.
 */
export function findPosition(
  spans: TextNodeSpan[],
  offset: number,
): NodePosition | null {
  if (spans.length === 0) return null;

  let lo = 0;
  let hi = spans.length - 1;
  let candidate: number | null = null;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (spans[mid].offset <= offset) {
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
  const localOffset = offset - span.offset;

  // Offset is within this span (or exactly at its end — caret after
  // last char). Stay within the same TextNode.
  if (localOffset <= span.text.length) {
    return { key: span.key, offset: localOffset };
  }

  // Offset is past the end of this span and into a gap.
  // Snap to the start of the next span if available.
  if (candidate + 1 < spans.length) {
    return { key: spans[candidate + 1].key, offset: 0 };
  }

  // No next span — caret after last char of this span.
  return { key: span.key, offset: span.text.length };
}

/**
 * Converts a content offset range to a NodeRange.
 * Returns null only if there are no spans at all.
 */
export function findRange(
  spans: TextNodeSpan[],
  { offset, length }: Span,
): NodeRange {
  // findPosition never returns null when spans is non-empty
  const anchor = findPosition(spans, offset);
  assert(
    anchor,
    `span anchor @${offset} should resolve against spans ${JSON.stringify(spans)}`,
  );

  const focus = findPosition(spans, offset + length);
  assert(
    focus,
    `span anchor @${offset + length} should resolve against spans ${JSON.stringify(spans)}`,
  );

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
