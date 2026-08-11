import { MARK_PALETTE } from "@/editor/markColors.ts";

export function MarkSwatches() {
  return (
    <div class="fixed bottom-8 right-8 z-toast flex flex-col gap-2 rounded bg-paper border border-stroke p-4 text-xs shadow-sm">
      {(["regular", "active"] as const).map((variant) => (
        <div key={variant} class="flex items-center gap-2">
          {MARK_PALETTE.map((c) => (
            <span key={c} class="relative inline-flex h-6 px-2 items-center">
              <span
                class={`mark-band inset-0 ${variant === "active" ? "is-active" : ""}`}
                style={{ backgroundColor: c, color: c }}
              />
              <span class="relative">text</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
