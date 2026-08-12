import { WavyRenderer } from "@/components/highlights/WavyRenderer.tsx";
import { MARK_PALETTE } from "@/editor/markColors.ts";
import type { MarkRect } from "@/signals/sidenotes.ts";

const VARIANTS = ["regular", "active"] as const;
const EMPTY: ReadonlySet<string> = new Set();

// TEMPORARY palette preview -- remove once the palette/opacities are settled.
export function MarkSwatches() {
  return (
    <div class="fixed bottom-8 right-8 z-toast flex flex-col gap-1 rounded bg-paper border border-stroke/50 p-2 text-xs">
      {VARIANTS.map((variant) => (
        <div key={`band-${variant}`} class="flex items-center gap-1">
          {MARK_PALETTE.map((c) => (
            <span
              key={c}
              class="relative inline-flex h-6 w-12 items-center justify-center"
            >
              <span
                class={`mark-band inset-0 ${variant === "active" ? "is-active" : ""}`}
                style={{ backgroundColor: c, color: c }}
              />
              <span class="relative">text</span>
            </span>
          ))}
        </div>
      ))}
      {VARIANTS.map((variant) => (
        <div key={`wavy-${variant}`} class="flex items-center gap-1">
          {MARK_PALETTE.map((c, ci) => {
            const id = `swatch-${ci}`;
            const rect: MarkRect = {
              id,
              color: c,
              left: 0,
              top: 0,
              width: 48,
              height: 24,
              order: 0,
              bandCount: 1,
            };
            return (
              <span
                key={c}
                class="relative inline-flex h-6 w-12 items-center justify-center"
              >
                <WavyRenderer
                  rects={[rect]}
                  activeIds={variant === "active" ? new Set([id]) : EMPTY}
                />
                <span class="relative">text</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
