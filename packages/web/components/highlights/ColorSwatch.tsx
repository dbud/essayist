import type { MarkRect } from "@/signals/sidenotes.ts";
import { WavyRenderer } from "./WavyRenderer.tsx";

const EMPTY: ReadonlySet<string> = new Set();
const SWATCH_W = 64;
const SWATCH_H = 24;

// One color rendered in the four candidate mark styles: wavy, wavy-inner,
// band, band-inner. Shared by the admin swatches panel and the category
// form preview so both screens show the same renderings.
export function ColorSwatch({ color }: { color: string }) {
  const id = "swatch";
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
    <>
      <span class="relative inline-flex h-6 w-16 items-center justify-center">
        <WavyRenderer rects={[rect]} activeIds={EMPTY} innerId={null} />
        <span class="relative">text</span>
      </span>
      <span class="relative inline-flex h-6 w-16 items-center justify-center">
        <WavyRenderer rects={[rect]} activeIds={EMPTY} innerId={id} />
        <span class="relative">text</span>
      </span>
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
    </>
  );
}
