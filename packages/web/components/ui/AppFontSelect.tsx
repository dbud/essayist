import { OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import { type AppFont, appFont } from "@/signals/preferences.ts";

const LABELS: Record<AppFont, string> = {
  atkinson: "Atkinson Hyperlegible",
  gothic: "Special Gothic",
  system: "System",
};

/** Interface font radio rows for the settings menu options grid. */
export default function AppFontSelect() {
  return (
    <OptionsRow
      kind="radio"
      name="app-font"
      label="Interface font"
      options={(Object.keys(LABELS) as AppFont[]).map((font) => ({
        value: font,
        label: LABELS[font],
      }))}
      values={[appFont.value]}
      onToggle={(v) => {
        appFont.value = v as AppFont;
      }}
    />
  );
}
