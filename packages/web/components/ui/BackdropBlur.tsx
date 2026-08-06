type Direction = "to bottom" | "to top";

export interface BackdropBlurProps {
  layers?: number;
  blur?: number;
  blurRatio?: number;
  plateau?: number;
  steps?: number;
  direction?: Direction;
  class?: string;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function smoothStepQuintic(t: number) {
  return t;
  // return 6 * t ** 5 - 15 * t ** 4 + 10 * t ** 3;
}

/** Opacity at position x in [0,1] for a band with plateau l and range r.
 *  Returns 1 for x <= l, quintic fade from 1 to 0 in [l, r], 0 for x >= r. */
function fade(x: number, l: number, r: number) {
  return smoothStepQuintic(clamp((r - x) / (r - l)));
}

/** Progressive backdrop blur: masked layers whose blur compounds at the edge. */
export default function BackdropBlur({
  layers: n = 8,
  blur: blurMax = 10,
  blurRatio = 1.3,
  plateau: l = 0,
  steps = 8,
  direction = "to bottom",
  class: className = "",
}: BackdropBlurProps) {
  const blurMin = blurMax / blurRatio ** (n - 1);

  const masks = Array.from({ length: n }, (_, i) => {
    const blur = blurMin * blurRatio ** i;
    const r = l + ((1 - l) * (n - i)) / n;

    const stops = [`#000 ${(l * 100).toFixed(1)}%`];
    for (let s = 1; s < steps; s++) {
      const t = l + ((r - l) * s) / steps;
      const alpha = fade(t, l, r);
      stops.push(`rgba(0,0,0,${alpha.toFixed(3)}) ${(t * 100).toFixed(1)}%`);
    }
    stops.push(`transparent ${(r * 100).toFixed(1)}%`);

    const mask = `linear-gradient(${direction}, ${stops.join(", ")})`;

    return (
      <div
        key={i}
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: `blur(${blur}px)`,
          WebkitBackdropFilter: `blur(${blur}px)`,
          maskImage: mask,
          WebkitMaskImage: mask,
          pointerEvents: "none",
        }}
      />
    );
  });

  return (
    <div class={`absolute inset-0 ${className}`} aria-hidden="true">
      {masks}
    </div>
  );
}
