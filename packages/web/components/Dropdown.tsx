import { useSignal } from "@preact/signals";
import type { VNode } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface DropdownProps {
  /** Classes for the `<summary>` trigger. */
  buttonClass?: string;
  /** Content rendered inside the `<summary>` trigger. */
  button: VNode;
  /** Extra classes for the `<details class="dropdown ...">` wrapper (e.g. `dropdown-end`). */
  dropdownClass?: string;
  /** Menu content; `close` dismisses the dropdown (call it from item clicks). */
  children: (close: () => void) => VNode;
}

/**
 * Reusable dropdown shell: owns open/close state and outside-click handling,
 * and wires the `<details>`/`<summary>` plumbing. Consumers provide the
 * trigger and the menu.
 */
export default function Dropdown({
  buttonClass = "btn btn-sm",
  button,
  dropdownClass,
  children,
}: DropdownProps) {
  const open = useSignal(false);
  const ref = useRef<HTMLDetailsElement>(null);

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
    <details
      class={`dropdown ${dropdownClass ?? ""}`}
      open={open.value}
      ref={ref}
    >
      {/** biome-ignore lint/a11y/useSemanticElements: summary is clickable */}
      <summary
        role="button"
        class={buttonClass}
        onClick={(e) => {
          e.preventDefault();
          open.value = !open.value;
        }}
      >
        {button}
      </summary>
      {children(close)}
    </details>
  );
}
