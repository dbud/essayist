import { ColorSwatch } from "@/components/highlights/ColorSwatch.tsx";
import { swatchEntries } from "@/signals/categoryPreview.ts";

export default function MarkSwatches() {
  return (
    <div class="flex w-fit flex-col gap-5 bg-paper border border-stroke shadow-md p-5 text-xs">
      {swatchEntries.value.map(({ key, label, color }) => (
        <div key={key} class="flex items-center gap-2">
          <span class="w-24">{label}</span>
          <ColorSwatch color={color} />
        </div>
      ))}
    </div>
  );
}
