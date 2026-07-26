export interface MeasureContext {
  // Viewport rect of the root's offsetParent; positions are reported in this
  // space (same as offsetTop/offsetLeft).
  containerRect: DOMRect;
  doc: Document;
}

// Resolves the measure container for `root`: its offsetParent's viewport rect
// and the owner document. null when `root` is null or has no offsetParent.
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

// Non-null, non-zero rect; collapsed/empty ranges yield zero rects.
export function hasRect(rect: DOMRect | null): rect is DOMRect {
  return rect !== null && (rect.top !== 0 || rect.height !== 0);
}

// Last line rect of `el`'s content (end of the text; last line when wrapped).
// Uses getClientRects on the full range since a collapsed range's rect is
// zero-height. null when the element has no laid-out content.
export function contentEndRect(el: HTMLElement, doc: Document): DOMRect | null {
  const range = doc.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  if (rects.length === 0) return null;
  return rects[rects.length - 1];
}

// Collapsed Range rect at `offset` within `el`'s first text child; null when
// `el` has no text child. Measures a point inside a text node (e.g. a
// zero-length mark's anchor).
export function textPointRect(
  el: HTMLElement,
  offset: number,
  doc: Document,
): DOMRect | null {
  const textNode = el.firstChild;
  if (textNode === null || textNode.nodeType !== doc.TEXT_NODE) return null;
  const text = textNode as Text;
  const range = doc.createRange();
  range.setStart(text, Math.min(offset, text.length));
  range.collapse(true);
  return range.getBoundingClientRect();
}
