export interface MeasureContext {
  // Viewport rect of the root's offsetParent; positions are reported in this
  // space (same as offsetTop/offsetLeft).
  containerRect: DOMRect;
  doc: Document;
}

export function getMeasureContext(
  root: HTMLElement | null,
): MeasureContext | null {
  if (root === null) return null;
  const container = root.offsetParent as HTMLElement | null;
  if (container === null) return null;
  return {
    containerRect: container.getBoundingClientRect(),
    doc: root.ownerDocument ?? document,
  };
}

// Non-zero rect; collapsed/empty ranges yield zero rects (not null).
export function hasRect(rect: DOMRect | null): rect is DOMRect {
  return rect !== null && (rect.top !== 0 || rect.height !== 0);
}

// Last line rect of `el`'s content. getClientRects on the full range, since a
// collapsed range's rect is zero-height. null if no laid-out content.
export function contentEndRect(el: HTMLElement, doc: Document): DOMRect | null {
  const range = doc.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  if (rects.length === 0) return null;
  return rects[rects.length - 1];
}

// Box of the character at `index` in `text`, or null if out of range / no box.
export function charRectAt(
  text: Text,
  index: number,
  doc: Document,
): DOMRect | null {
  if (index < 0 || index >= text.length) return null;
  const range = doc.createRange();
  range.setStart(text, index);
  range.setEnd(text, index + 1);
  const rect = range.getBoundingClientRect();
  return rect.height > 0 ? rect : null;
}

// Resolve a selection point to an equivalent point inside a text node, so a
// collapsed range there has a line-box: a caret on an element (e.g. a mark
// after a join) sits at an element boundary, whose range is zero-height. null
// for a truly empty block.
export function resolveTextPoint(
  node: Node,
  offset: number,
  doc: Document,
): { node: Text; offset: number } | null {
  if (node.nodeType === doc.TEXT_NODE) return { node: node as Text, offset };
  const el = node as Element;
  const before = offset > 0 ? el.childNodes[offset - 1] : null;
  if (before) {
    const last = lastTextDescendant(before, doc);
    if (last) return { node: last, offset: last.length };
  }
  const after = offset < el.childNodes.length ? el.childNodes[offset] : null;
  if (after) {
    const first = firstTextDescendant(after, doc);
    if (first) return { node: first, offset: 0 };
  }
  return null;
}

function firstTextDescendant(node: Node, doc: Document): Text | null {
  if (node.nodeType === doc.TEXT_NODE) return node as Text;
  const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function lastTextDescendant(node: Node, doc: Document): Text | null {
  if (node.nodeType === doc.TEXT_NODE) return node as Text;
  const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let n = walker.nextNode() as Text | null;
  while (n !== null) {
    last = n;
    n = walker.nextNode() as Text | null;
  }
  return last;
}

// Nearest ancestor with a non-zero rect, for a block with no line-box (e.g. an
// empty paragraph).
export function elementRectFallback(node: Node, doc: Document): DOMRect | null {
  let el: Element | null =
    node.nodeType === doc.ELEMENT_NODE ? (node as Element) : node.parentElement;
  while (el !== null) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) return r;
    el = el.parentElement;
  }
  return null;
}

// Rect of the element child adjacent to a caret with no neighbouring text -- the
// single line it occupies. The element fallback would otherwise return the
// whole containing block.
export function adjacentElementRect(
  node: Node,
  offset: number,
  doc: Document,
): DOMRect | null {
  if (node.nodeType !== doc.ELEMENT_NODE) return null;
  const children = (node as Element).childNodes;
  const candidates = [
    offset < children.length ? children[offset] : null,
    offset > 0 ? children[offset - 1] : null,
  ];
  for (const child of candidates) {
    if (child !== null && child.nodeType === doc.ELEMENT_NODE) {
      const r = (child as Element).getBoundingClientRect();
      if (r.height > 0) return r;
    }
  }
  return null;
}

// Collapsed range at `offset` in `el`'s first text child, or `el`'s own rect if
// it has none, so a zero-length mark still anchors at the paragraph.
export function textPointRect(
  el: HTMLElement,
  offset: number,
  doc: Document,
): DOMRect {
  const textNode = el.firstChild;
  if (textNode === null || textNode.nodeType !== doc.TEXT_NODE) {
    return el.getBoundingClientRect();
  }
  const text = textNode as Text;
  const range = doc.createRange();
  range.setStart(text, Math.min(offset, text.length));
  range.collapse(true);
  return range.getBoundingClientRect();
}
