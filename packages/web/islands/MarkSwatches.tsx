import { ColorSwatch } from "@/components/highlights/ColorSwatch.tsx";
import { FALLBACK_COLOR } from "@/editor/markColors.ts";
import { getCategories } from "@/signals/categories.ts";

export default function MarkSwatches() {
  const entries = [
    ...getCategories().list.value.map((c) => ({
      key: c.id,
      label: c.label,
      color: c.color ?? FALLBACK_COLOR,
    })),
    { key: "__ink", label: "(unlabeled)", color: FALLBACK_COLOR },
  ];
  return (
    <div class="flex w-fit flex-col gap-5 bg-paper border border-stroke shadow-md p-5 text-xs">
      {entries.map(({ key, label, color }) => (
        <div key={key} class="flex items-center gap-2">
          <span class="w-24">{label}</span>
          <ColorSwatch color={color} />
        </div>
      ))}
    </div>
  );
}
