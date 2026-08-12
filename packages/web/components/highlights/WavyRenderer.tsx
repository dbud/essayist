import type { HighlightRendererProps } from "./types.ts";

// Wavy underline beneath each marked line segment. Overlapping marks cascade
// downward by band order. Active id gets a thicker, opaque stroke. Drawn as
// SVG paths in the overlay layer.

// Tunables. BASELINE_RATIO is the baseline as a fraction of the line-box
// height (prose line-height ~1.75 -> baseline ~0.67); the wave sits just below.
const BASELINE_RATIO = 1.0;
const STACK_GAP = 4; // vertical offset per overlapping mark
const AMPLITUDE = 1;
const AMPLITUDE_ACTIVE = 1.2;
const WAVELENGTH = 10;

// Trim to 1 decimal to keep path data compact.
const r = (n: number): string => n.toFixed(1);

/** A sine-like wave from x0..x0+w centered on y0. Built from cubic beziers, one
 *  per half-wave, alternating above/below y0. A trailing partial half-wave
 *  tapers so the wave fits exactly within w. */
function wavePath(x0: number, y0: number, w: number, amp: number): string {
  const half = WAVELENGTH / 2;
  const k = 0.36; // control-point ratio for a sine-ish cubic
  let d = `M ${r(x0)} ${r(y0)}`;
  let x = x0;
  let up = true;
  while (x < x0 + w) {
    const seg = Math.min(half, x0 + w - x);
    const ratio = seg / half; // taper a partial final hump
    const cy = y0 + (up ? -1 : 1) * ((4 * amp) / 3) * ratio;
    d += ` C ${r(x + seg * k)} ${r(cy)} ${r(x + seg * (1 - k))} ${r(cy)} ${r(x + seg)} ${r(y0)}`;
    x += seg;
    up = !up;
  }
  return d;
}

export function WavyRenderer({
  rects,
  activeIds,
  innerId,
}: HighlightRendererProps) {
  return (
    <svg aria-hidden="true" class="mark-wavy">
      {rects.map(({ id, color, left, width, top, height, order }, i) => {
        const inner = id === innerId;
        const active = inner || activeIds.has(id);
        const y = top + height * BASELINE_RATIO + order * STACK_GAP;
        return (
          <path
            key={i}
            class={inner ? "is-inner" : active ? "is-active" : ""}
            d={wavePath(left, y, width, active ? AMPLITUDE_ACTIVE : AMPLITUDE)}
            fill="none"
            strokeLinecap="round"
            style={{ stroke: color }}
          />
        );
      })}
    </svg>
  );
}
