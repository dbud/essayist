import { ColorSwatch } from "@/components/highlights/ColorSwatch.tsx";
import { swatchEntries } from "@/signals/categoryPreview.ts";

export default function MarkSwatches() {
  return (
    <div class="flex flex-col stack stack--col shadow-md text-xs">
      {swatchEntries.value.map(({ key, label, color }) => (
        <div key={key} class="grid grid-cols-[auto_1fr] stack stack--row">
          <div class="cell--data w-24 text-ink/60">{label}</div>
          <div class="cell--data min-w-0">
            <ColorSwatch color={color} />
          </div>
        </div>
      ))}
    </div>
  );
}
