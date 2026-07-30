import type { ComponentChildren } from "preact";

interface MenuItemProps {
  selected?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}

export default function MenuItem({
  selected,
  onClick,
  children,
}: MenuItemProps) {
  return (
    <li>
      <button
        type="button"
        class={`gap-2 py-1 ${selected ? "bg-primary/10 text-primary rounded-field" : ""}`}
        onClick={onClick}
      >
        {children}
      </button>
    </li>
  );
}
