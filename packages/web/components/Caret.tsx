import type { ReadonlySignal } from "@preact/signals";
import type { CaretRect } from "@/signals/editorSelection.ts";

export function Caret({ rect }: { rect: ReadonlySignal<CaretRect | null> }) {
  const value = rect.value;
  if (value === null) return null;
  return (
    <div class="pointer-events-none absolute inset-0">
      <span
        class="essayist-caret absolute"
        style={{
          "--caret-left": `${value.left}px`,
          "--caret-top": `${value.top}px`,
          "--caret-line-height": `${value.height}px`,
        }}
      />
    </div>
  );
}
