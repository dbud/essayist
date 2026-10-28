import type { Signal } from "@preact/signals";

import { type Option, OptionsRow } from "#/components/ui/forms/OptionsRow.tsx";

export const SANS_FONT_OPTIONS: Option[] = [
  { value: "atkinson", label: "Atkinson Hyperlegible" },
  { value: "gothic", label: "Special Gothic" },
  { value: "system", label: "System" },
];

export const SERIF_FONT_OPTIONS: Option[] = [
  { value: "vollkorn", label: "Vollkorn" },
  { value: "plex", label: "Plex Serif" },
  { value: "system", label: "System" },
];

export interface FontAxis {
  readonly signal: Signal<string>;
  readonly options: Option[];
}

interface FontAxisSelectProps {
  axis: FontAxis;
  name: string;
  label: string;
}

export default function FontAxisSelect({ axis, name, label }: FontAxisSelectProps) {
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
