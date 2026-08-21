import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useClickOutside } from "@/hooks/useClickOutside.ts";

interface DropdownProps {
  triggerClass?: string;
  trigger: ComponentChildren;
  children: (close: () => void) => ComponentChildren;
}

/** Dropdown shell with open/close state and outside-click dismissal. */
export default function Dropdown({
  triggerClass = "btn",
  trigger,
  children,
}: DropdownProps) {
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);

  return (
    <div
      class={`inline-flex relative ${open.value ? "is-open" : ""}`}
      ref={ref}
    >
      <button
        type="button"
        class={`${triggerClass} ${open.value ? "dropdown-open" : ""}`}
        onClick={() => (open.value = !open.value)}
      >
        {trigger}
      </button>
      {open.value && children(close)}
    </div>
  );
}

export function DropdownMenu({
  end,
  children,
}: {
  end?: boolean;
  children: ComponentChildren;
}) {
  const align = end ? "dropdown-menu--end" : "";
  return (
    <ul class={`dropdown-menu ${align}`} data-stagger-children>
      {children}
    </ul>
  );
}

interface DropdownItemProps {
  selected?: boolean;
  onClick?: () => void;
  href?: string;
  children: ComponentChildren;
}

export function DropdownItem({
  selected,
  onClick,
  href,
  children,
}: DropdownItemProps) {
  const cls = `dropdown-item ${selected ? "is-selected" : ""}`;
  return (
    <li>
      {href ? (
        <a href={href} class={cls} onClick={onClick}>
          {children}
        </a>
      ) : (
        <button type="button" class={cls} onClick={onClick}>
          {children}
        </button>
      )}
    </li>
  );
}
