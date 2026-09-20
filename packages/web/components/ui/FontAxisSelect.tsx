import { OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import type { FontAxis } from "@/signals/fonts.ts";

interface FontAxisSelectProps {
  axis: FontAxis<string>;
  name: string;
  label: string;
}

export default function FontAxisSelect({
  axis,
  name,
  label,
}: FontAxisSelectProps) {
  return (
    <OptionsRow
      kind="radio"
      name={name}
      label={label}
      options={axis.options}
      values={[axis.signal.value]}
      onToggle={(v) => (axis.signal.value = v)}
    />
  );
}
