import { OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import { type HighlightStyle, highlightStyle } from "@/signals/preferences.ts";

const OPTIONS: { value: HighlightStyle; label: string }[] = [
  { value: "band", label: "Band" },
  { value: "wavy", label: "Wavy" },
];

/** Mark highlight style radio rows for the settings menu options grid. */
export default function MarkStyleSelect() {
  return (
    <OptionsRow
      kind="radio"
      name="mark-style"
      label="Mark style"
      options={OPTIONS}
      values={[highlightStyle.value]}
      onToggle={(v) => {
        highlightStyle.value = v as HighlightStyle;
      }}
    />
  );
}
