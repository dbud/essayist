import { useEffect, useRef } from "preact/hooks";

import { barValues } from "#/models/reviewPulse.ts";

const BAR_COUNT = 80;
const BAR_WIDTH = 2;
const GAP = 2;
const HEIGHT = 45;
const AMP_TRANSITION = "300ms";

export default function ReviewPulse({
  runId,
  amplitude = 1,
  class: className,
}: {
  runId: string;
  amplitude?: number;
  class?: string;
}) {
  const rects = useRef<(SVGRectElement | null)[]>([]);

  const initial = barValues(runId, BAR_COUNT, Date.now());

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const values = barValues(runId, BAR_COUNT, Date.now());
      for (let i = 0; i < BAR_COUNT; i++) {
        const rect = rects.current[i];
        if (rect !== null) rect.setAttribute("height", values[i].toString());
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [runId]);

  const step = BAR_WIDTH + GAP;
  const viewBoxW = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * GAP;
  return (
    <svg
      width={viewBoxW}
      height={HEIGHT}
      viewBox={`0 0 ${viewBoxW} 1`}
      preserveAspectRatio="none"
      aria-hidden="true"
      class={className}
    >
      <g
        style={{
          "--wave-amp": amplitude,
          transform: "scaleY(var(--wave-amp, 1))",
          "transform-box": "fill-box",
          "transform-origin": "bottom",
          transition: `transform ${AMP_TRANSITION} ease-out`,
          animation: `wave-amp-in ${AMP_TRANSITION} ease-out`,
        }}
      >
        <g class="wave-bar-graph">
          {Array.from({ length: BAR_COUNT }, (_, i) => (
            <rect
              key={i}
              class="wave-bar-base"
              x={i * step}
              y={0}
              width={BAR_WIDTH}
              height={initial[i]}
              ref={(el) => {
                rects.current[i] = el;
              }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}
