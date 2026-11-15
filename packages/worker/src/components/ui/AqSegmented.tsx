import { type Signal } from "@preact/signals";

export default function AqSegmented({
  value,
  options,
  label,
}: {
  value: Signal<number>;
  options: { value: number; label: string }[];
  label: string;
}) {
  return (
    <div class="aq-segmented" role="radiogroup" aria-label={label}>
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
