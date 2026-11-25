import AqSegmented from "#/components/ui/Segmented.tsx";
import { type HighlightStyle, usePreferences } from "#/models/preferences.ts";

const OPTIONS: { value: HighlightStyle; label: string }[] = [
  { value: "band", label: "Band" },
  { value: "wavy", label: "Wavy" },
];

export default function MarkStyleSelect() {
  const { highlightStyle } = usePreferences();
  return (
    <div class="menu">
      <ul class="menu-rows" data-stagger>
        <li class="flex flex-col gap-1">
          <span class="shrink-0 px-2">Mark style</span>
          <AqSegmented value={highlightStyle} options={OPTIONS} label="Mark style" />
        </li>
      </ul>
    </div>
  );
}
