import type { ComponentChildren } from "preact";
import { CheckboxIcon, RadioIcon } from "@/components/ui/icons.tsx";

export interface Option {
  value: string;
  label: ComponentChildren;
}

interface RadioItemProps {
  name: string;
  opt: Option;
  selected: boolean;
  onToggle: (value: string) => void;
}

function RadioItem({ name, opt, selected, onToggle }: RadioItemProps) {
  return (
    <label class="btn cursor-pointer gap-2">
      <input
        type="radio"
        class="sr-only"
        name={name}
        checked={selected}
        onChange={() => onToggle(opt.value)}
      />
      <RadioIcon selected={selected} size={16} />
      <span class="min-w-0 truncate">{opt.label}</span>
    </label>
  );
}

interface CheckboxItemProps {
  opt: Option;
  selected: boolean;
  onToggle: (value: string) => void;
}

function CheckboxItem({ opt, selected, onToggle }: CheckboxItemProps) {
  return (
    <label class="btn cursor-pointer gap-2">
      <input
        type="checkbox"
        class="sr-only"
        checked={selected}
        onChange={() => onToggle(opt.value)}
      />
      <CheckboxIcon selected={selected} size={16} />
      <span class="min-w-0 truncate">{opt.label}</span>
    </label>
  );
}

function OptionList({
  kind,
  name,
  options,
  values,
  onToggle,
}: {
  kind: "radio" | "checkbox";
  name: string;
  options: Option[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) {
    return <div class="cell--data min-w-0 text-ink/60">none available</div>;
  }
  return (
    <div class="flex min-w-0 flex-col stack">
      {options.map((opt) =>
        kind === "radio" ? (
          <RadioItem
            key={opt.value}
            name={name}
            opt={opt}
            selected={values.includes(opt.value)}
            onToggle={onToggle}
          />
        ) : (
          <CheckboxItem
            key={opt.value}
            opt={opt}
            selected={values.includes(opt.value)}
            onToggle={onToggle}
          />
        ),
      )}
    </div>
  );
}

interface OptionsRowProps {
  kind: "radio" | "checkbox";
  name: string;
  label: string;
  options: Option[];
  values: string[];
  onToggle: (value: string) => void;
}

/** Label + radio/checkbox option group row. */
export function OptionsRow({
  kind,
  name,
  label,
  options,
  values,
  onToggle,
}: OptionsRowProps) {
  return (
    <>
      <span class="cell--data text-ink/60">{label}</span>
      <OptionList
        kind={kind}
        name={name}
        options={options}
        values={values}
        onToggle={onToggle}
      />
    </>
  );
}
