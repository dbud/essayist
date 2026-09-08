interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Explicit monotonic values; overrides min/max/step when non-empty. */
  values?: readonly number[];
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  disabled?: boolean;
  class?: string;
}

function nearestIndex(values: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) {
      best = i;
    }
  }
  return best;
}

/** Label + native range input + value readout. */
export default function Slider({
  label,
  value,
  onChange,
  values,
  min = 0,
  max = 100,
  step = 1,
  format,
  disabled,
  class: className,
}: SliderProps) {
  const list = values && values.length > 0 ? values : null;
  const count = list
    ? list.length
    : Math.max(1, Math.floor((max - min) / step) + 1);
  const lastIndex = count - 1;
  const index = list
    ? nearestIndex(list, value)
    : Math.min(lastIndex, Math.max(0, Math.round((value - min) / step)));
  const fmt = (v: number) => (format ? format(v) : String(v));
  const text = fmt(value);
  const widest = (list ?? [min, max]).reduce((a, b) =>
    fmt(b).length > fmt(a).length ? b : a,
  );

  return (
    <label
      class={`flex w-full gap-2 cursor-pointer${className ? ` ${className}` : ""}`}
    >
      <span>{label}</span>
      <input
        class="slider min-w-0 flex-1"
        type="range"
        min={0}
        max={lastIndex}
        step={1}
        value={index}
        aria-label={label}
        aria-valuetext={text}
        disabled={disabled || count === 1}
        onInput={(e) => {
          const i = Number(e.currentTarget.value);
          onChange(list ? list[i] : min + i * step);
        }}
      />
      <span class="relative shrink-0">
        <span class="invisible" aria-hidden="true">
          {fmt(widest)}
        </span>
        <span class="absolute inset-y-0 right-0" aria-hidden="true">
          {text}
        </span>
      </span>
    </label>
  );
}
