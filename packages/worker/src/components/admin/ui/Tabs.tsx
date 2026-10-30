import type { ComponentChildren } from "preact";

export interface TabItem<T extends string> {
  value: T;
  label: ComponentChildren;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  class?: string;
}

export default function Tabs<T extends string>({
  items,
  value,
  onChange,
  class: className,
}: TabsProps<T>) {
  return (
    <div class={`flex stack stack--row ${className ?? ""}`} role="tablist">
      {items.map((item) => {
        const selected = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            class={`btn ${selected ? "is-selected" : ""}`}
            aria-selected={selected}
            onClick={() => onChange(item.value)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
