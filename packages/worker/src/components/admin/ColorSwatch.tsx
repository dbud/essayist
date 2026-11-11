import { WavyRenderer } from "#/components/editor/highlights/WavyRenderer.tsx";
import type { MarkFragmentRect } from "#/models/sidenotes.ts";

const EMPTY: ReadonlySet<string> = new Set();
const SWATCH_W = 64;
const SWATCH_H = 24;

// A category color in the four candidate mark styles: wavy, wavy-inner, band, band-inner. The
// renderers resolve color by id, so the swatch supplies a one-entry map.
export function ColorSwatch({ color }: { color: string }) {
  const id = "swatch";
  const colorById = new Map([[id, color]]);
  const rect: MarkFragmentRect = {
    id,
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
        <WavyRenderer rects={[rect]} colorById={colorById} activeIds={EMPTY} innerId={null} />
        <span class="relative">text</span>
      </span>
      <span class="relative inline-flex h-6 w-16 items-center justify-center">
        <WavyRenderer rects={[rect]} colorById={colorById} activeIds={EMPTY} innerId={id} />
        <span class="relative">text</span>
      </span>
      <span class="relative inline-flex h-6 w-16 items-center justify-center">
        <span class="mark-band inset-0" style={{ backgroundColor: color, color }} />
        <span class="relative">text</span>
      </span>
      <span class="relative inline-flex h-6 w-16 items-center justify-center">
        <span class="mark-band is-inner inset-0" style={{ backgroundColor: color, color }} />
        <span class="relative">text</span>
      </span>
    </>
  );
}
