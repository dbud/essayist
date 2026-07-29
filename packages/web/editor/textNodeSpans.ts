import { $isCodeNode } from "@lexical/code";
import { assert } from "@std/assert/assert";
import type { LexicalNode, TextNode } from "lexical";
import { $getRoot, $isElementNode, $isTextNode } from "lexical";

// Chars `@lexical/markdown` escapes with a `\` prefix in non-code text nodes.
// `/g` for `.replace`; use `HAS_ESCAPE` for `.test`.
const ESCAPE_SET = /([*_`~\\])/g;
// Non-global form of `ESCAPE_SET` for stateless `.test` (single-char and
// "contains any" checks).
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
 * Maps a Lexical TextNode to a substring of the exported markdown.
 *
 * `text` is the editor-space text. `offset` is the markdown-space index where
 * the node's footprint begins. `markdown` is the markdown-space form of `text`
 * -- what the export wrote at `offset` -- stored only when it differs from
 * `text` (non-code prose containing an escape-set char).
 */
export interface TextNodeSpan {
  key: string;
  text: string;
  offset: number;
  markdown?: string;
}

export interface Span {
  offset: number;
  length: number;
}

/**
 * Walks the active tree (`$getRoot()`) and maps each TextNode to its position
 * in the exported markdown. Runs in a $-context, so during `editor.update` it
 * sees the in-flight (mutated) state.
 */
export function $collectTextNodeSpans(content: string): TextNodeSpan[] {
  const spans: TextNodeSpan[] = [];

  let searchFrom = 0;
  for (const { node: tn, inCode } of $walkTextNodes($getRoot())) {
    const text = tn.getTextContent();
    if (text.length === 0) continue;

    const needle =
      inCode || !HAS_ESCAPE.test(text)
        ? text
        : text.replace(ESCAPE_SET, "\\$1");

    const idx = content.indexOf(needle, searchFrom);
    if (idx === -1) continue; // dropped (graceful, as before)

    spans.push({
      key: tn.getKey(),
      text,
      offset: idx,
      markdown: needle === text ? undefined : needle,
    });
    searchFrom = idx + needle.length;
  }

  return spans;
}

/**
 * Finds the TextNode and local editor offset for a markdown-space offset.
 * Binary search on the sorted spans -- O(log n). An offset in a gap between
 * spans (markdown syntax like `#`, `>`, `**`) snaps to the nearest valid text
 * position: end of the preceding span or start of the next.
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

  // Offset is before all spans -- snap to start of first span.
  if (candidate === null) return { key: spans[0].key, offset: 0 };

  const span = spans[candidate];
  const markdown = span.markdown ?? span.text;
  const mdLocal = offset - span.offset;

  // Past this span's markdown range and into a gap. Snap to the start of the
  // next span if available, otherwise caret after this span's last char.
  if (mdLocal > markdown.length) {
    if (candidate + 1 < spans.length) {
      return { key: spans[candidate + 1].key, offset: 0 };
    }
    return { key: span.key, offset: span.text.length };
  }

  // Within the span (or exactly at its end -- caret after last char).
  if (span.markdown === undefined) return { key: span.key, offset: mdLocal };
  return { key: span.key, offset: markdownOffsetToEditor(markdown, mdLocal) };
}

/**
 * Inverse of `findPosition`: maps a NodePosition to its markdown-space offset,
 * or null when the position isn't on a tracked TextNode (e.g. an element/root
 * selection), so callers can fall back to a clone.
 *
 * A caret "before X" round-trips to the markdown offset of `X` (skipping the
 * `\` of `\X`), so editor offsets map back to the visible char, not the
 * escape prefix.
 */
export function positionToOffset(
  spans: TextNodeSpan[],
  { key, offset }: NodePosition,
): number | null {
  const span = spans.find((s) => s.key === key);
  if (span === undefined) return null;
  if (span.markdown === undefined) return span.offset + offset;
  return span.offset + editorOffsetToMarkdown(span.markdown, offset);
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

/**
 * Converts a markdown-space local offset to an editor-space local offset,
 * walking `\X` escapes. Each `\X` is 2 markdown chars / 1 editor char. A
 * target landing on the `X` (between `\` and `X`) maps to "before X" -- the
 * `\` has no editor char. Inverse of `editorOffsetToMarkdown`.
 */
function markdownOffsetToEditor(markdown: string, mOffset: number): number {
  let m = 0; // markdown offset
  let e = 0; // editor offset
  while (m < mOffset) {
    if (markdown[m] === "\\" && HAS_ESCAPE.test(markdown[m + 1] ?? "")) {
      if (m + 2 <= mOffset) {
        m += 2;
        e += 1;
      } else {
        // `mdLocal` is the `X` of this `\X` -- caret before X.
        m = mOffset;
      }
    } else {
      m += 1;
      e += 1;
    }
  }
  return e;
}

/**
 * Inverse of `markdownOffsetToEditor`. A caret "before X" maps to the markdown
 * offset of `X` (skipping the `\`), not the escape prefix.
 */
function editorOffsetToMarkdown(markdown: string, eOffset: number): number {
  let m = 0;
  let e = 0;
  while (e < eOffset) {
    if (markdown[m] === "\\" && HAS_ESCAPE.test(markdown[m + 1] ?? "")) {
      m += 2;
      e += 1;
    } else {
      m += 1;
      e += 1;
    }
  }
  // Caret at `ep` sitting before the `X` of a `\X` -- markdown offset of `X`.
  if (markdown[m] === "\\" && HAS_ESCAPE.test(markdown[m + 1] ?? "")) {
    m += 1;
  }
  return m;
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
