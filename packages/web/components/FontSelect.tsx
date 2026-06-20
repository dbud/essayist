import { viewerFont } from "@/signals/preferences.ts";

const fontOptions = [
  { value: "font-serif", label: "Serif" },
  { value: "font-sans", label: "Sans" },
  { value: "font-mono", label: "Mono" },
];

export default function FontSelect() {
  return (
    <div class="flex items-center gap-2">
      <span class="text-xs text-base-content/50 font-sans">Font</span>
      <div class="join">
        {fontOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            class={`join-item btn btn-xs ${opt.value} ${
              viewerFont.value === opt.value ? "btn-active" : ""
            }`}
            onClick={() => (viewerFont.value = opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
