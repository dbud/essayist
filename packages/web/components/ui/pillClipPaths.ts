// Superellipse exponent shared by every squircle corner (buttons, dropdowns,
// toasts). n=2 is a circle; higher n straightens the curve.
const N = 2.7;
const SAMPLES = 24;

type Corner = "tl" | "tr" | "bl" | "br";

/** SVG path for one corner of a rounded rect, in 0..1 objectBoundingBox coords.
 *  The corner mask is r x r, so objectBoundingBox maps the quarter-superellipse
 *  without distortion. `r` is the semi-axis (1 = fills the box, <1 = inset). */
function cornerPath(corner: Corner, r = 1): string {
  // Each corner is a quarter superellipse centered at the inner vertex (where
  // the straight edges meet); the curve bulges toward the outer corner.
  const centers: Record<Corner, [number, number]> = {
    tl: [1, 1],
    tr: [0, 1],
    bl: [1, 0],
    br: [0, 0],
  };
  const [cx, cy] = centers[corner];

  // Sweep the quarter from one straight edge to the other, around the corner.
  const angles: Record<Corner, [number, number]> = {
    tl: [Math.PI, (3 * Math.PI) / 2], // (0,1) -> (1,0)
    tr: [(3 * Math.PI) / 2, 2 * Math.PI], // (1,1) -> (0,0)
    bl: [Math.PI / 2, Math.PI], // (0,0) -> (1,1)
    br: [0, Math.PI / 2], // (1,0) -> (0,1)
  };
  const [a0, a1] = angles[corner];

  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = a0 + (a1 - a0) * (i / SAMPLES);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + r * Math.sign(c) * Math.abs(c) ** (2 / N);
    const y = cy + r * Math.sign(s) * Math.abs(s) ** (2 / N);
    pts.push([x, y]);
  }

  const [[x0, y0], ...rest] = pts;
  let d = `M ${x0.toFixed(4)} ${y0.toFixed(4)}`;
  for (const [x, y] of rest) {
    d += ` L ${x.toFixed(4)} ${y.toFixed(4)}`;
  }
  d += ` L ${cx.toFixed(4)} ${cy.toFixed(4)}`;
  d += " Z";
  return d;
}

/** Concentric inset of a corner by fraction f of its radius (0..1). Subtracted
 *  from the outer corner this yields a corner ring (inner stroke). */
function insetCornerPath(corner: Corner, f: number): string {
  return cornerPath(corner, 1 - f);
}

// Mask images for the `squircle` utility (see squircle.css). White fill reads
// as opaque under both alpha and luminance mask modes, so they work
// cross-browser.
function cornerSvg(corner: Corner): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path d="${cornerPath(corner)}" fill="#fff"/></svg>`;
}
function cornerRingSvg(corner: Corner, f: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill-rule="evenodd" d="${cornerPath(corner)} ${insetCornerPath(corner, f)}" fill="#fff"/></svg>`;
}
function dataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Inset fraction for the stroke ring. Coupled to the bar width in squircle.css
// (bar = --sq-r * STROKE_F). Tune both together.
const STROKE_F = 1 / 16;

export const SQ_TL = dataUri(cornerSvg("tl"));
export const SQ_TR = dataUri(cornerSvg("tr"));
export const SQ_BL = dataUri(cornerSvg("bl"));
export const SQ_BR = dataUri(cornerSvg("br"));
export const SQ_TL_RING = dataUri(cornerRingSvg("tl", STROKE_F));
export const SQ_TR_RING = dataUri(cornerRingSvg("tr", STROKE_F));
export const SQ_BL_RING = dataUri(cornerRingSvg("bl", STROKE_F));
export const SQ_BR_RING = dataUri(cornerRingSvg("br", STROKE_F));
