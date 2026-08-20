// Superellipse exponent shared by every squircle corner (buttons, dropdowns,
// toasts). n=2 is a circle; higher n straightens the curve.
const N = 2.7;
const SAMPLES = 24;

type Corner = "tl" | "tr" | "bl" | "br";

// Each corner is a quarter superellipse centered at the inner vertex (where
// the straight edges meet); the curve bulges toward the outer corner.
const CENTERS: Record<Corner, [number, number]> = {
  tl: [1, 1],
  tr: [0, 1],
  bl: [1, 0],
  br: [0, 0],
};

// Sweep the quarter from one straight edge to the other, around the corner.
const ANGLES: Record<Corner, [number, number]> = {
  tl: [Math.PI, (3 * Math.PI) / 2], // (0,1) -> (1,0)
  tr: [(3 * Math.PI) / 2, 2 * Math.PI], // (1,1) -> (0,0)
  bl: [Math.PI / 2, Math.PI], // (0,0) -> (1,1)
  br: [0, Math.PI / 2], // (1,0) -> (0,1)
};

/** Sampled quarter-superellipse for one corner at semi-axis `r`
 *  (1 = fills the box, <1 = inset), in 0..1 objectBoundingBox coords. */
function arcPoints(corner: Corner, r: number): Array<[number, number]> {
  const [cx, cy] = CENTERS[corner];
  const [a0, a1] = ANGLES[corner];
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = a0 + (a1 - a0) * (i / SAMPLES);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + r * Math.sign(c) * Math.abs(c) ** (2 / N);
    const y = cy + r * Math.sign(s) * Math.abs(s) ** (2 / N);
    pts.push([x, y]);
  }
  return pts;
}

/** Build a <path> element (white fill) from points: move to the first,
 *  line through the rest, then close. */
function path(pts: Array<[number, number]>): string {
  const [[x0, y0], ...rest] = pts;
  let d = `M ${x0.toFixed(4)} ${y0.toFixed(4)}`;
  for (const [x, y] of rest) {
    d += ` L ${x.toFixed(4)} ${y.toFixed(4)}`;
  }
  d += " Z";
  return `<path d="${d}" fill="#fff"/>`;
}

/** SVG path for one corner of a rounded rect: arc plus edges to inner vertex. */
function cornerPath(corner: Corner, r = 1): string {
  const pts = [...arcPoints(corner, r), CENTERS[corner]];
  return path(pts);
}

/** Ring band for one corner, inset by fraction f of its radius (0..1),
 *  drawn as one continuous path. */
function cornerRingPath(corner: Corner, f: number): string {
  // outer arc out, then inner arc reversed back; Z closes radially to start.
  const pts = [...arcPoints(corner, 1), ...arcPoints(corner, 1 - f).reverse()];
  return path(pts);
}

/** Wrap a path element in a 1x1 objectBoundingBox SVG. */
function wrapSvg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none">${inner}</svg>`;
}

function cornerSvg(corner: Corner): string {
  return wrapSvg(cornerPath(corner));
}
function cornerRingSvg(corner: Corner, f: number): string {
  return wrapSvg(cornerRingPath(corner, f));
}
function dataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Inset fraction for the stroke ring (stroke-width / radius)
const STROKE_F = 1.5 / 15;

export const SQ_TL = dataUri(cornerSvg("tl"));
export const SQ_TR = dataUri(cornerSvg("tr"));
export const SQ_BL = dataUri(cornerSvg("bl"));
export const SQ_BR = dataUri(cornerSvg("br"));
export const SQ_TL_RING = dataUri(cornerRingSvg("tl", STROKE_F));
export const SQ_TR_RING = dataUri(cornerRingSvg("tr", STROKE_F));
export const SQ_BL_RING = dataUri(cornerRingSvg("bl", STROKE_F));
export const SQ_BR_RING = dataUri(cornerRingSvg("br", STROKE_F));
