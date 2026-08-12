import { highlightStyle } from "@/signals/preferences.ts";

const OPTIONS = [
  { value: "band", label: "Band" },
  { value: "wavy", label: "Wavy" },
] as const;

// Toggle between highlight styles (band vs wavy). Active option is accent;
// the rest stay default. Reads/writes the global `highlightStyle` signal.
export default function SidenoteControls() {
  return (
    <div class="flex items-center gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          class={`btn btn--ghost ${highlightStyle.value === o.value ? "is-selected" : ""}`}
          onClick={() => (highlightStyle.value = o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
