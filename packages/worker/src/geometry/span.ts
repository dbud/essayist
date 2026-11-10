export interface Box {
  top: number;
  height: number;
}

export interface Span {
  top: number;
  bottom: number;
}

export const spanOf = (box: Box): Span => ({ top: box.top, bottom: box.top + box.height });

// The smallest span containing all the given spans; undefined only for an empty list.
export function hull(spans: readonly Span[]): Span | undefined {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const span of spans) {
    top = Math.min(top, span.top);
    bottom = Math.max(bottom, span.bottom);
  }
  return top <= bottom ? { top, bottom } : undefined;
}

// First item whose span extends past an edge. Strict: a span ending exactly at the edge does not
// cross it.
export const firstAfterEdge = <T>(
  items: readonly T[],
  span: (item: T) => Span,
  edge: number,
): T | undefined => items.find((item) => span(item).bottom > edge);

// Last item whose span starts before an edge. Strict: a span starting exactly at the edge is not
// before it.
export const lastBeforeEdge = <T>(
  items: readonly T[],
  span: (item: T) => Span,
  edge: number,
): T | undefined => items.findLast((item) => span(item).top < edge);

export const outsideOf = (span: Span, bounds: Span): boolean =>
  span.top < bounds.top || span.bottom > bounds.bottom;

// A fraction (0..1) of the span's own extent.
export function coveredFraction(span: Span, cover: Span): number {
  const overlap = Math.min(span.bottom, cover.bottom) - Math.max(span.top, cover.top);
  const length = span.bottom - span.top;
  return overlap <= 0 || length <= 0 ? 0 : Math.min(1, overlap / length);
}
