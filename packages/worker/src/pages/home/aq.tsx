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

import AqCollapse from "#/components/ui/AqCollapse.tsx";
import AqSegmented from "#/components/ui/AqSegmented.tsx";
import Swappable from "#/components/ui/Swappable.tsx";
import { useClickOutside } from "#/hooks/useClickOutside.ts";

const INTERVAL_OPTIONS = [
  { value: 5, label: "5s" },
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 120, label: "2m" },
  { value: 300, label: "5m" },
];

const FONT_OPTIONS = [
  { value: "atkinson", label: "Atkinson Hyperlegible" },
  { value: "gothic", label: "Special Gothic" },
  { value: "system", label: "System" },
];

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
  const autosave = useSignal(true);
  const interval = useSignal(5);
  const sansFont = useSignal("atkinson");
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
            <li class="flex flex-col min-w-52">
              <button
                type="button"
                role="switch"
                aria-checked={autosave.value}
                class={`aq-menu-btn aq-toggle-row ${autosave.value ? "is-on" : ""}`}
                onClick={() => (autosave.value = !autosave.value)}
              >
                <span>Autosave</span>
              </button>
              <AqCollapse open={autosave.value} fade>
                <div class="aq-melt bg-float/60 mt-1">
                  <AqSegmented value={interval} options={INTERVAL_OPTIONS} label="Interval" />
                </div>
              </AqCollapse>
            </li>
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
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            <li class="flex flex-col gap-1">
              <span class="shrink-0">Interface font</span>
              <div class="aq-melt bg-float/60">
                <AqSegmented
                  value={sansFont}
                  options={FONT_OPTIONS}
                  label="Interface font"
                  vertical
                />
              </div>
            </li>
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
