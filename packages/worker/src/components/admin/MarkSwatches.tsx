import { ColorSwatch } from "#/components/admin/ColorSwatch.tsx";
import { type SwatchEntry } from "#/models/admin.ts";
import { useAdminModels } from "#/pages/admin/models.ts";

export default function MarkSwatches() {
  const { admin } = useAdminModels();
  const entries: SwatchEntry[] = admin.swatchEntries.value;
  return (
    <div class="flex flex-col swiss-stack swiss-stack--col shadow-md text-xs">
      {entries.map(({ key, label, color }) => (
        <div key={key} class="grid grid-cols-[auto_1fr] swiss-stack swiss-stack--row">
          <div class="swiss-cell--data w-24 text-ink/60">{label}</div>
          <div class="swiss-cell--data min-w-0">
            <ColorSwatch color={color} />
          </div>
        </div>
      ))}
    </div>
  );
}
