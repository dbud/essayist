interface MeltFilterProps {
  readonly sigma?: number;
  readonly gain?: number;
  readonly bias?: number;
}

/** Filter region presets, in objectBoundingBox percentages: sizes are relative
 * to the container bbox. */
const MELT_PRESETS = [
  { id: "melt", x: -150, y: -150, width: 400, height: 400 },
  { id: "melt-wide", x: -400, y: -100, width: 900, height: 1000 },
] as const;

export default function MeltFilter({ sigma = 12, gain = 18, bias = -6 }: MeltFilterProps) {
  const alphaRow = `0 0 0 ${gain} ${bias}`;
  return (
    <svg width="0" height="0" class="absolute" aria-hidden="true">
      <defs>
        {MELT_PRESETS.map((p) => (
          <filter
            key={p.id}
            id={p.id}
            x={`${p.x}%`}
            y={`${p.y}%`}
            width={`${p.width}%`}
            height={`${p.height}%`}
            color-interpolation-filters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation={sigma} result="blur" />
            <feColorMatrix
              in="blur"
              result="melt"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${alphaRow}`}
            />
            <feComposite in="SourceGraphic" in2="melt" operator="atop" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
