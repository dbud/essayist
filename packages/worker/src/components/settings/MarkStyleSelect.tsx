import AqSegmented from "#/components/ui/AqSegmented.tsx";
import { type HighlightStyle, usePreferences } from "#/models/preferences.ts";

const OPTIONS: { value: HighlightStyle; label: string }[] = [
  { value: "band", label: "Band" },
  { value: "wavy", label: "Wavy" },
];

export default function MarkStyleSelect() {
  const { highlightStyle } = usePreferences();
  return (
    <div class="aq-menu">
      <ul class="aq-menu-rows" data-aq-stagger>
        <li class="flex flex-col gap-1">
          <span class="shrink-0 px-2">Mark style</span>
          <AqSegmented value={highlightStyle} options={OPTIONS} label="Mark style" />
        </li>
      </ul>
    </div>
  );
}
