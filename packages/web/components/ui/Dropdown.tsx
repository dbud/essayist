import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open.value) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        open.value = false;
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open.value]);

  const close = () => (open.value = false);

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

export function DropdownMenu({ children }: { children: ComponentChildren }) {
  return (
    <ul class="dropdown-menu dropdown-menu--no-tl" data-stagger-children>
      {children}
      {/*<div class="dropdown-corner dropdown-corner--tl" data-no-motion />*/}
      <div class="dropdown-corner dropdown-corner--tr" data-no-motion />
      <div class="dropdown-corner dropdown-corner--bl" data-no-motion />
      <div class="dropdown-corner dropdown-corner--br" data-no-motion />
    </ul>
  );
}

interface DropdownItemProps {
  selected?: boolean;
  onClick: () => void;
  children: ComponentChildren;
}

export function DropdownItem({
  selected,
  onClick,
  children,
}: DropdownItemProps) {
  return (
    <li>
      <button
        type="button"
        class={`dropdown-item ${selected ? "is-selected" : ""}`}
        onClick={onClick}
      >
        {children}
      </button>
    </li>
  );
}
