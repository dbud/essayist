import { type Signal } from "@preact/signals";

export default function AqSegmented<T extends number | string>({
  value,
  options,
  label,
  vertical = false,
  class: extra,
}: {
  value: Signal<T>;
  options: { value: T; label: string }[];
  label: string;
  vertical?: boolean;
  class?: string;
}) {
  const classes = vertical ? "aq-segmented aq-segmented--vertical" : "aq-segmented";
  return (
    <div class={extra ? `${classes} ${extra}` : classes} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value.value === option.value}
          class={option.value === value.value ? "is-selected" : ""}
          onClick={() => (value.value = option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
