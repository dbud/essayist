import { MARK_PALETTE } from "@/editor/markColors.ts";

// TEMPORARY palette preview -- remove once the palette/opacities are settled.
// Each mark color at the two band opacities (regular / active), reading the
// same CSS vars the bands use (var(--mark-band-pct) / var(--mark-band-active-pct))
// so it tracks styles.css exactly.
export function MarkSwatches() {
  return (
    <div class="fixed bottom-8 right-8 z-50 flex flex-col gap-2 rounded bg-base-100 p-2 text-xs shadow">
      {(["regular", "active"] as const).map((variant) => (
        <div key={variant} class="flex items-center gap-1">
          <span class="w-14 capitalize text-base-content/70">{variant}</span>
          {MARK_PALETTE.map((c) => (
            <span
              key={c}
              class="h-6 w-6 rounded"
              style={
                variant === "active"
                  ? `background:${c};color:${c};opacity:var(--mark-band-active-pct);box-shadow:0 0 0 1.5px currentColor`
                  : `background:${c};opacity:var(--mark-band-pct)`
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
