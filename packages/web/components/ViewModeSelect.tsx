import { viewMode } from "@/signals/preferences.ts";

const viewModeOptions = [
  { value: "auto", label: "Auto" },
  { value: "markdown", label: "Markdown" },
  { value: "plain", label: "Plain" },
];

export default function ViewModeSelect() {
  return (
    <div class="flex items-center gap-2">
      <span class="text-xs text-base-content/50 font-sans">View</span>
      <div class="join">
        {viewModeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            class={`join-item btn btn-xs ${
              viewMode.value === opt.value ? "btn-active" : ""
            }`}
            onClick={() => (viewMode.value = opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
