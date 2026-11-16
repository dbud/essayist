import { type Signal } from "@preact/signals";

import AqSegmented from "#/components/ui/AqSegmented.tsx";

export const SANS_FONT_OPTIONS = [
  { value: "atkinson", label: "Hyperlegible" },
  { value: "gothic", label: "Gothic" },
  { value: "system", label: "System" },
];

export const SERIF_FONT_OPTIONS = [
  { value: "vollkorn", label: "Vollkorn" },
  { value: "plex", label: "Plex Serif" },
  { value: "system", label: "System" },
];

interface FontAxis {
  readonly signal: Signal<string>;
  readonly options: { value: string; label: string }[];
}

interface FontAxisSelectProps {
  axis: FontAxis;
  label: string;
}

export default function FontAxisSelect({ axis, label }: FontAxisSelectProps) {
  return (
    <div class="aq-menu">
      <ul class="aq-menu-rows" data-aq-stagger>
        <li class="flex flex-col gap-1">
          <span class="shrink-0 px-2">{label}</span>
          <AqSegmented value={axis.signal} options={axis.options} label={label} />
        </li>
      </ul>
    </div>
  );
}
