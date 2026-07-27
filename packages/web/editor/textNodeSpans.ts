import { $isCodeNode } from "@lexical/code";
import { assert } from "@std/assert/assert";
import type { EditorState, LexicalNode, TextNode } from "lexical";
import { $getRoot, $isElementNode, $isTextNode } from "lexical";

// Chars `@lexical/markdown`'s `exportTextFormat` escapes with a `\` prefix in
// non-code text nodes. Used to pre-escape a text-node needle so `indexOf`
// matches the exported content (which has `\X` where the editor has `X`).
const ESCAPE_SET = /([*_`~\\])/g;
// True if a text node contains any escape-set char (so its verbatim text won't
// appear in `content` and the needle must be pre-escaped).
const HAS_ESCAPE = /[*_`~\\]/;

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
 * Walks the active tree (`$getRoot()`) and maps each TextNode to its markdown
 * offset. Runs in a $-context; during `editor.update` it sees the in-flight
 * (mutated) state, unlike `buildTextNodeSpans(editor.getEditorState(), …)`.
 *
 * The markdown export escapes `* _ ` ~ \` as `\X` inside non-code text nodes,
 * so a text node containing one of those chars no longer appears verbatim in
 * `content` and a bare `indexOf` would drop it. To stay on the fast native
 * `indexOf` path, only the needle is pre-escaped when needed:
 *   - code text nodes (inline `code` format, or block-code `CodeHighlightNode`)
 *     are emitted raw by the export, so they match verbatim;
 *   - prose nodes containing an escape-set char are matched via their escaped
 *     needle (`\X`);
 *   - plain prose matches verbatim.
 * All branches are native string ops (`indexOf` + `replace`); no regex match,
 * no per-char JS loop.
 */
export function $collectTextNodeSpans(content: string): TextNodeSpan[] {
  const spans: TextNodeSpan[] = [];

  let searchFrom = 0;
  for (const { node: tn, inCode } of $walkTextNodes($getRoot())) {
    const text = tn.getTextContent();
    if (text.length === 0) continue;

    const isCode = inCode;
    let needle: string;
    let offsetShift: number;
    if (isCode || !HAS_ESCAPE.test(text)) {
      needle = text;
      offsetShift = 0;
    } else {
      needle = text.replace(ESCAPE_SET, "\\$1");
      // `indexOf` lands on the `\` of a leading `\X`; the text node's first
      // char is the `X` after it, so shift by 1 to match the offset a bare
      // `indexOf(X)` (and the mark resolver) would land on. `\\` (a literal
      // backslash) is the exception -- its first char IS the first `\`.
      offsetShift = needle[0] === "\\" && needle[1] !== "\\" ? 1 : 0;
    }

    const idx = content.indexOf(needle, searchFrom);
    if (idx === -1) continue; // dropped (graceful, as before)

    spans.push({ key: tn.getKey(), text, offset: idx + offsetShift });
    searchFrom = idx + needle.length;
  }

  return spans;
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
  return state.read(() => $collectTextNodeSpans(content));
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
 * Inverse of findPosition: maps a NodePosition back to an absolute markdown
 * offset. Returns null when the position is not on a tracked TextNode (e.g.
 * an element/root selection), so callers can fall back to a clone.
 */
export function positionToOffset(
  spans: TextNodeSpan[],
  { key, offset }: NodePosition,
): number | null {
  const span = spans.find((s) => s.key === key);
  return span === undefined ? null : span.offset + offset;
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

  const focus = length === 0 ? anchor : findPosition(spans, offset + length);
  assert(
    focus,
    `span anchor @${offset + length} should resolve against spans ${JSON.stringify(spans)}`,
  );

  return { anchor, focus };
}

function* $walkTextNodes(
  node: LexicalNode,
  inCode = false,
): Generator<{ node: TextNode; inCode: boolean }> {
  // Block code (`CodeNode`) is emitted raw by the export -- no escaping -- so
  // every text node under it is code-context. Inline code is a `TextNode` with
  // the `code` format flag (not under a `CodeNode`); folded into `inCode` below.
  if ($isCodeNode(node)) inCode = true;
  if ($isTextNode(node)) {
    yield { node, inCode: inCode || node.hasFormat("code") };
  } else if ($isElementNode(node)) {
    for (const child of node.getChildren()) {
      yield* $walkTextNodes(child, inCode);
    }
  }
}
