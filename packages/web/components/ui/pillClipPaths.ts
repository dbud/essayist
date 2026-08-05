// Superellipse exponent. n=2 is a circle; higher n straightens the curve.
const N = 2.7;
const SAMPLES = 24;

/** SVG path for one pill cap (a semicircle), in 0..1 objectBoundingBox coords.
 *  The cap pseudo-element is h/2 x h, so objectBoundingBox maps a=1.0 (x) to
 *  h/2 px and b=0.5 (y) to h/2 px -- a circle of radius h/2, no distortion. */
export function capPath(side: "left" | "right"): string {
  const cx = side === "left" ? 1 : 0;
  const cy = 0.5;
  const a = 1.0;
  const b = 0.5;

  const pts: Array<[number, number]> = [];
  const a0 = side === "left" ? Math.PI / 2 : -Math.PI / 2;
  const a1 = side === "left" ? (3 * Math.PI) / 2 : Math.PI / 2;

  for (let i = 0; i <= SAMPLES; i++) {
    const t = a0 + (a1 - a0) * (i / SAMPLES);
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.abs(c) ** (2 / N);
    const y = cy + b * Math.sign(s) * Math.abs(s) ** (2 / N);
    pts.push([x, y]);
  }

  let d = `M ${pts[0][0].toFixed(4)} ${pts[0][1].toFixed(4)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(4)} ${pts[i][1].toFixed(4)}`;
  }
  d += " Z";
  return d;
}

export const LEFT_PATH = capPath("left");
export const RIGHT_PATH = capPath("right");

const M = 4;

/** SVG path for one corner of a rounded rect, in 0..1 objectBoundingBox coords.
 *  The corner pseudo-element is a r x r square, so objectBoundingBox maps the
 *  quarter-superellipse without distortion. */
export function cornerPath(corner: "tl" | "tr" | "bl" | "br"): string {
  // Each corner is a quarter superellipse centered at the inner vertex (the
  // point where the straight edges meet). The curve bulges toward the outer
  // corner of the square.
  // tl: center at (1,1), curve from (0,1) to (1,0) -- top-left corner
  // tr: center at (0,1), curve from (1,1) to (0,0) -- top-right corner
  // bl: center at (1,0), curve from (0,0) to (1,1) -- bottom-left corner
  // br: center at (0,0), curve from (1,0) to (0,1) -- bottom-right corner
  const centers: Record<"tl" | "tr" | "bl" | "br", [number, number]> = {
    tl: [1, 1],
    tr: [0, 1],
    bl: [1, 0],
    br: [0, 0],
  };
  const [cx, cy] = centers[corner];
  const r = 1.0; // semi-axis fills the square

  // Sweep the quarter from one straight edge to the other, going around the
  // outer corner.
  const angles: Record<"tl" | "tr" | "bl" | "br", [number, number]> = {
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
    const x = cx + r * Math.sign(c) * Math.abs(c) ** (2 / M);
    const y = cy + r * Math.sign(s) * Math.abs(s) ** (2 / M);
    pts.push([x, y]);
  }

  let d = `M ${pts[0][0].toFixed(4)} ${pts[0][1].toFixed(4)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(4)} ${pts[i][1].toFixed(4)}`;
  }
  d += " Z";
  return d;
}

export const TL_PATH = cornerPath("tl");
export const TR_PATH = cornerPath("tr");
export const BL_PATH = cornerPath("bl");
export const BR_PATH = cornerPath("br");
