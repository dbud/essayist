import { useComputed, useSignal } from "@preact/signals";
import {
  ChevronDown,
  CreditCard,
  FileInput,
  FileText,
  Folder,
  LogOut,
  Plus,
  Settings2,
  Slash,
  User,
} from "lucide-preact";

import Swappable from "#/components/ui/Swappable.tsx";
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

const PROJECTS: { name: string; files: { name: string }[] }[] = [
  {
    name: "Moby Dick",
    files: [{ name: "chapter-1.md" }, { name: "chapter-2.md" }, { name: "notes.md" }],
  },
  { name: "Groceries", files: [{ name: "list.md" }, { name: "recipes.md" }] },
  { name: "Untitled", files: [{ name: "scratch.md" }] },
  { name: "Empty", files: [] },
];

export function AqProjects() {
  const open = useSignal(false);
  const selectedProject = useSignal(0);
  const selectedFile = useSignal(1);
  const openedProject = useSignal(-1);
  const openedFile = useSignal(-1);
  const close = () => {
    open.value = false;
    openedProject.value = -1;
    openedFile.value = -1;
  };
  const ref = useClickOutside(open.value ? close : undefined);

  const toggleProject = (i: number) => {
    if (openedProject.value === i) {
      openedProject.value = -1;
      openedFile.value = -1;
    } else {
      openedProject.value = i;
      openedFile.value = -1;
    }
  };

  const pick = (pi: number, fi: number) => {
    selectedProject.value = pi;
    selectedFile.value = fi;
    close();
  };

  const shownProject = useComputed(() =>
    openedProject.value >= 0 ? PROJECTS[openedProject.value] : PROJECTS[selectedProject.value],
  );
  const shownFile = useComputed(() => {
    if (openedFile.value >= 0) {
      return PROJECTS[openedProject.value].files[openedFile.value].name;
    }
    if (openedProject.value >= 0) {
      return null;
    }
    return PROJECTS[selectedProject.value].files[selectedFile.value].name;
  });

  return (
    <div class="aq-melt" ref={ref}>
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open.value}
        onClick={() => {
          open.value = !open.value;
          if (open.value) {
            openedProject.value = selectedProject.value;
            openedFile.value = selectedFile.value;
          } else {
            openedProject.value = -1;
            openedFile.value = -1;
          }
        }}
      >
        <Swappable swapKey={shownProject.value.name} class="swap-shift" fluid>
          <span>{shownProject.value.name}</span>
        </Swappable>
        <Swappable swapKey={shownFile.value ?? "slash"} class="swap-shift" fluid>
          <span class="inline-flex items-center gap-1">
            <Slash size={14} />
            {shownFile.value !== null && <span>{shownFile.value}</span>}
          </span>
        </Swappable>
        <ChevronDown class="aq-chevron" />
      </button>

      <div class={`aq-dropdown ${open.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {PROJECTS.map((project, i) => (
              <li class="relative">
                <button
                  type="button"
                  class={`aq-menu-btn ${openedProject.value === i ? "is-selected" : ""}`}
                  onClick={() => toggleProject(i)}
                >
                  <Folder />
                  <span>{project.name}</span>
                </button>
                <div
                  class={`aq-dropdown--right-bridged ${openedProject.value === i ? "is-open" : ""}`}
                >
                  {project.files.length > 0 && (
                    <div class="aq-menu">
                      <ul class="aq-menu-rows" data-aq-stagger>
                        {project.files.map((file, fi) => (
                          <li>
                            <button
                              type="button"
                              class={`aq-menu-btn ${openedFile.value === fi ? "is-selected" : ""}`}
                              onClick={() => pick(i, fi)}
                            >
                              <FileText />
                              <span>{file.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
