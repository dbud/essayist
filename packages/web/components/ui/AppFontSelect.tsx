import { OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import { type AppFont, appFont } from "@/signals/preferences.ts";

const LABELS: Record<AppFont, string> = {
  atkinson: "Atkinson Hyperlegible",
  gothic: "Special Gothic",
  system: "System",
};

/** Interface font radio row, embedded in the settings menu dropdown. */
export default function AppFontSelect() {
  return (
    <li class="flex w-full">
      <div class="form-grid w-full">
        <OptionsRow
          kind="radio"
          name="app-font"
          label="interface font"
          options={(Object.keys(LABELS) as AppFont[]).map((font) => ({
            value: font,
            label: LABELS[font],
          }))}
          values={[appFont.value]}
          onToggle={(v) => {
            appFont.value = v as AppFont;
          }}
        />
      </div>
    </li>
  );
}
