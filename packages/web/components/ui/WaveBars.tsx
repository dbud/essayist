const BAR_COUNT = 32;
const DURATION = 1.2;
const DEFAULT_BAR_WIDTH = 1.5;
const DEFAULT_GAP = 4;
const DEFAULT_HEIGHT = 45;
const DEFAULT_AMPLITUDE = 1;
const AMP_TRANSITION = "300ms";

interface Bar {
  x: number;
  y: number;
  height: number;
  delay: number;
}

export interface WaveBarsProps {
  barWidth?: number;
  gap?: number;
  amplitude?: number;
  fill?: boolean;
  class?: string;
}

export default function WaveBars({
  barWidth = DEFAULT_BAR_WIDTH,
  gap = DEFAULT_GAP,
  amplitude = DEFAULT_AMPLITUDE,
  fill = false,
  class: className = "",
}: WaveBarsProps) {
  const step = barWidth + gap;
  const viewBoxW = BAR_COUNT * barWidth + (BAR_COUNT - 1) * gap;
  const bars: Bar[] = Array.from({ length: BAR_COUNT }, (_, i) => {
    const t = i / (BAR_COUNT - 1);
    const amp = Math.sin(t * Math.PI);
    return {
      x: i * step,
      y: 1 - amp,
      height: amp,
      delay: -((i * DURATION) / BAR_COUNT),
    };
  });

  // The group scales the whole wave by amplitude. A one-shot keyframe
  // (wave-amp-in) grows it from 0 on mount; the transition handles later
  // amplitude prop changes.
  const svg = (
    <svg
      aria-hidden="true"
      class={fill ? "h-full" : className}
      width={viewBoxW}
      height={DEFAULT_HEIGHT}
      viewBox={`0 0 ${viewBoxW} 1`}
      preserveAspectRatio="none"
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
        {bars.map(({ x, y, height, delay }, i) => (
          <rect
            key={i}
            class="wave-bar"
            x={x}
            y={y}
            width={barWidth}
            height={height}
            style={{
              "--wave-delay": `${delay}s`,
              "--wave-duration": `${DURATION}s`,
            }}
          />
        ))}
      </g>
    </svg>
  );

  if (!fill) return svg;

  // anchor the wave at the bottom-right of the nearest positioned ancestor
  return (
    <div class={`absolute inset-0 flex items-end justify-end ${className}`}>
      {svg}
    </div>
  );
}
