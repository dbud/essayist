import { WavyRenderer } from "@/components/highlights/WavyRenderer.tsx";
import { FALLBACK_COLOR } from "@/editor/markColors.ts";
import { categories } from "@/signals/categories.ts";
import type { MarkRect } from "@/signals/sidenotes.ts";

const EMPTY: ReadonlySet<string> = new Set();
const SWATCH_W = 64;
const SWATCH_H = 24;

// TEMPORARY category color preview -- remove once colors/opacities are settled.
// One row per category: label, band, band-inner, wavy, wavy-inner.
export default function MarkSwatches() {
  const entries = [
    ...categories.list.value.map((c) => ({
      key: c.id,
      label: c.label,
      color: c.color ?? FALLBACK_COLOR,
    })),
    { key: "__ink", label: "(unlabeled)", color: FALLBACK_COLOR },
  ];
  return (
    <div class="fixed bottom-10 right-10 z-toast flex flex-col gap-1 shadow-md bg-paper border border-stroke p-2 text-xs">
      {entries.map(({ key, label, color }) => {
        const id = `swatch-${key}`;
        const rect: MarkRect = {
          id,
          color,
          left: 0,
          top: 0,
          width: SWATCH_W,
          height: SWATCH_H,
          order: 0,
          bandCount: 1,
        };
        return (
          <div key={key} class="flex items-center gap-2">
            <span class="w-24 truncate text-right">{label}</span>
            <span class="relative inline-flex h-6 w-16 items-center justify-center">
              <span
                class="mark-band inset-0"
                style={{ backgroundColor: color, color }}
              />
              <span class="relative">text</span>
            </span>
            <span class="relative inline-flex h-6 w-16 items-center justify-center">
              <span
                class="mark-band is-inner inset-0"
                style={{ backgroundColor: color, color }}
              />
              <span class="relative">text</span>
            </span>
            <span class="relative inline-flex h-6 w-16 items-center justify-center">
              <WavyRenderer rects={[rect]} activeIds={EMPTY} innerId={null} />
              <span class="relative">text</span>
            </span>
            <span class="relative inline-flex h-6 w-16 items-center justify-center">
              <WavyRenderer rects={[rect]} activeIds={EMPTY} innerId={id} />
              <span class="relative">text</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
