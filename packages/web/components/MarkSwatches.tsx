import { MARK_PALETTE } from "@/editor/markColors.ts";

export function MarkSwatches() {
  return (
    <div class="fixed bottom-8 right-8 z-toast flex flex-col gap-1 rounded bg-paper border border-stroke/50 p-2 text-xs">
      {(["regular", "active"] as const).map((variant) => (
        <div key={variant} class="flex items-center gap-1">
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
