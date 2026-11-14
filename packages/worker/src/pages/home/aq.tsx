import { useSignal } from "@preact/signals";
import { ChevronDown, CreditCard, FileText, LogOut, Plus, Settings2, User } from "lucide-preact";

import { useClickOutside } from "#/hooks/useClickOutside.ts";

const MENU_ROWS = [
  { label: "Profile", icon: <User /> },
  { label: "Settings", icon: <Settings2 /> },
  { label: "Billing", icon: <CreditCard /> },
  { label: "Sign out", icon: <LogOut /> },
];

/** Panel hangs attached below the trigger; the tuck keeps the seam melted
    at rest. */
export function AqMenu() {
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);

  return (
    <div class={`aq-melt ${open.value ? "is-open" : ""}`} ref={ref}>
      <button type="button" class="aq-btn" onClick={() => (open.value = !open.value)}>
        <span>Settings</span>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class="aq-dropdown aq-dropdown--origin-end">
        <div class="aq-menu">
          <div class="aq-menu-head">
            <p class="text-base font-semibold">Jane Doe</p>
            <p class="text-[0.85rem] text-float-ink">jane@example.com</p>
          </div>
          <ul class="aq-menu-rows" data-aq-stagger>
            {MENU_ROWS.map((row) => (
              <li>
                <button type="button" class="aq-menu-btn" onClick={close}>
                  {row.icon}
                  <span>{row.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const FILE_ROWS: { name: string; selected?: boolean }[] = [
  { name: "moby-dick.md" },
  { name: "groceries.md", selected: true },
  { name: "untitled.md" },
];

/** Dropdown composition: a menu of files with a floating action button after
    it, separated by the dropdown gap. */
export function AqFiles() {
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);

  return (
    <div class={`aq-melt ${open.value ? "is-open" : ""}`} ref={ref}>
      <button type="button" class="aq-btn" onClick={() => (open.value = !open.value)}>
        <span>Files</span>
        <ChevronDown class="aq-chevron" />
      </button>

      <div class="aq-dropdown">
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {FILE_ROWS.map((row) => (
              <li>
                <button
                  type="button"
                  class={`aq-menu-btn ${row.selected ? "is-selected" : ""}`}
                  onClick={close}
                >
                  <FileText />
                  <span>{row.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" class="aq-btn" onClick={close}>
          <Plus />
          <span>New file</span>
        </button>
      </div>
    </div>
  );
}
