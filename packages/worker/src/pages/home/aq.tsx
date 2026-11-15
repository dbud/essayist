import { useSignal } from "@preact/signals";
import {
  ChevronDown,
  CreditCard,
  FileInput,
  FileText,
  Folder,
  LogOut,
  Plus,
  Settings2,
  User,
} from "lucide-preact";

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
    <div class="aq-melt" ref={ref}>
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <span>Settings</span>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class={`aq-dropdown--origin-end ${open.value ? "is-open" : ""}`}>
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

const PROJECTS: { name: string; files: { name: string; selected?: boolean }[] }[] = [
  {
    name: "Moby Dick",
    files: [
      { name: "chapter-1.md" },
      { name: "chapter-2.md", selected: true },
      { name: "notes.md" },
    ],
  },
  { name: "Groceries", files: [{ name: "list.md" }, { name: "recipes.md" }] },
  { name: "Untitled", files: [{ name: "scratch.md" }] },
];

export function AqProjects() {
  const open = useSignal(false);
  const openProject = useSignal(-1);
  const close = () => {
    open.value = false;
    openProject.value = -1;
  };
  const ref = useClickOutside(open.value ? close : undefined);

  const toggleProject = (i: number) => {
    openProject.value = openProject.value === i ? -1 : i;
  };

  return (
    <div class="aq-melt" ref={ref}>
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open.value}
        onClick={() => {
          open.value = !open.value;
          openProject.value = -1;
        }}
      >
        <span>Projects</span>
        <ChevronDown class="aq-chevron" />
      </button>

      <div class={`aq-dropdown ${open.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {PROJECTS.map((project, i) => (
              <li class="relative">
                <button
                  type="button"
                  class={`aq-menu-btn ${openProject.value === i ? "is-selected" : ""}`}
                  onClick={() => toggleProject(i)}
                >
                  <Folder />
                  <span>{project.name}</span>
                </button>
                <div class={`aq-dropdown--right ${openProject.value === i ? "is-open" : ""}`}>
                  <div class="aq-menu">
                    <ul class="aq-menu-rows" data-aq-stagger>
                      {project.files.map((file) => (
                        <li>
                          <button
                            type="button"
                            class={`aq-menu-btn ${file.selected ? "is-selected" : ""}`}
                            onClick={close}
                          >
                            <FileText />
                            <span>{file.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button type="button" class="aq-btn" onClick={close}>
                    <Plus />
                    <span>New file</span>
                  </button>
                  <button type="button" class="aq-btn" onClick={close}>
                    <FileInput />
                    <span>Import file</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <button type="button" class="aq-btn" onClick={close}>
          <Plus />
          <span>New project</span>
        </button>
      </div>
    </div>
  );
}
