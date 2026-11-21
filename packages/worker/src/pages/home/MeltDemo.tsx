import { type Signal, useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, Highlighter } from "lucide-preact";
import type { ComponentChildren } from "preact";

import AqSegmented from "#/components/ui/AqSegmented.tsx";
import AqSwap from "#/components/ui/AqSwap.tsx";
import { simulateContextLoss } from "#/melt/context.ts";
import { useMeltCanvas } from "#/melt/useMeltCanvas.ts";

/** A group root, melted by the shader when drawn, and by the SVG filter otherwise. */
function MeltGroup({
  drawn,
  class: extra,
  children,
}: {
  drawn: boolean;
  class?: string;
  children: ComponentChildren;
}) {
  const melt = useMeltCanvas<HTMLDivElement>();
  return (
    <div ref={drawn ? melt : undefined} class={`aq-melt ${extra ?? ""}`}>
      {children}
    </div>
  );
}

interface DemoState {
  busy: Signal<boolean>;
  menuOpen: Signal<boolean>;
  navOpen: Signal<boolean>;
  segment: Signal<string>;
}

function Buttons({ drawn }: { drawn: boolean }) {
  return (
    <MeltGroup drawn={drawn} class="flex items-center gap-1">
      <button type="button" class="aq-btn">
        Settings
      </button>
      <button type="button" class="aq-btn--accent">
        Review
      </button>
      <button type="button" class="aq-btn--idle">
        Saved
      </button>
      <button type="button" class="aq-btn--small">
        B
      </button>
    </MeltGroup>
  );
}

/** A button whose content swaps and resizes, next to a button it melts into. */
function Swap({ drawn, state }: { drawn: boolean; state: DemoState }) {
  const busy = state.busy.value;
  return (
    <MeltGroup drawn={drawn} class="inline-flex items-center gap-1">
      <AqSwap on={busy ? "busy" : "idle"}>
        <button
          type="button"
          class={busy ? "aq-btn--idle" : "aq-btn--accent"}
          onClick={() => (state.busy.value = !busy)}
        >
          {busy ? (
            <>
              <span>Review in progress</span>
              <ChevronDown class="aq-chevron" />
            </>
          ) : (
            <>
              <Highlighter />
              <span>Review</span>
            </>
          )}
        </button>
      </AqSwap>
      <button type="button" class="aq-btn">
        Saved
      </button>
    </MeltGroup>
  );
}

const FONTS = ["Serif", "Sans", "Mono"];

/** A dropdown under its trigger, with a selected row. */
function Dropdown({ drawn, state }: { drawn: boolean; state: DemoState }) {
  const open = state.menuOpen.value;
  return (
    <MeltGroup drawn={drawn} class="inline-flex">
      <button
        type="button"
        class="aq-btn--idle"
        aria-expanded={open}
        onClick={() => (state.menuOpen.value = !open)}
      >
        <span>Aa</span>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class={`aq-dropdown aq-dropdown--origin-start ${open ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {FONTS.map((font, i) => (
              <li key={font}>
                <button type="button" class={`aq-menu-btn ${i === 1 ? "is-selected" : ""}`}>
                  {font}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MeltGroup>
  );
}

const PROJECTS = ["Essays", "Letters"];
const FILES = ["Draft.md", "Notes.md", "Outline.md"];

/** A detached dropdown with a bridged panel to the right of its selected row, like the file nav. */
function BridgedDropdown({ drawn, state }: { drawn: boolean; state: DemoState }) {
  const open = state.navOpen.value;
  return (
    <MeltGroup drawn={drawn} class="inline-flex">
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open}
        onClick={() => (state.navOpen.value = !open)}
      >
        <span>Essays / Draft.md</span>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class={`aq-dropdown aq-dropdown--detached ${open ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {PROJECTS.map((project, i) => (
              <li key={project} class="relative flex">
                <button type="button" class={`aq-menu-btn ${i === 0 ? "is-selected" : ""}`}>
                  {project}
                  {i === 0 && <ChevronRight class="absolute right-1" />}
                </button>
                {i === 0 && (
                  <div class={`aq-dropdown--right-bridged ${open ? "is-open" : ""}`}>
                    <span class="aq-dropdown-bridge" aria-hidden="true" />
                    <div class="aq-menu">
                      <ul class="aq-menu-rows" data-aq-stagger>
                        {FILES.map((file, j) => (
                          <li key={file}>
                            <button
                              type="button"
                              class={`aq-menu-btn ${j === 0 ? "is-selected" : ""}`}
                            >
                              {file}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </MeltGroup>
  );
}

const SEGMENTS = [
  { value: "2s", label: "2s" },
  { value: "5s", label: "5s" },
  { value: "10s", label: "10s" },
  { value: "1 min", label: "1 min" },
];

function Segmented({ drawn, state }: { drawn: boolean; state: DemoState }) {
  return (
    <MeltGroup drawn={drawn} class="inline-flex text-float-ink">
      <AqSegmented value={state.segment} options={SEGMENTS} label="Interval" />
    </MeltGroup>
  );
}

const SAMPLES = [
  { name: "buttons", Sample: Buttons, height: "h-16" },
  { name: "swap", Sample: Swap, height: "h-16" },
  { name: "dropdown", Sample: Dropdown, height: "h-52" },
  { name: "bridged", Sample: BridgedDropdown, height: "h-72" },
  { name: "segmented", Sample: Segmented, height: "h-16" },
];

/** Each sample drawn by the shader and by the SVG filter side by side. The two copies share their
    state, so clicking either one changes both. */
export default function MeltDemo() {
  const state: DemoState = {
    busy: useSignal(false),
    menuOpen: useSignal(false),
    navOpen: useSignal(false),
    segment: useSignal("5s"),
  };

  return (
    <section class="grid grid-cols-[6rem_1fr_1fr] gap-x-8 px-8 py-4 text-sm">
      <span />
      <span class="flex items-center gap-4 opacity-60">
        shader
        <button type="button" class="underline" onClick={() => simulateContextLoss()}>
          lose context for 2s
        </button>
      </span>
      <span class="opacity-60">svg filter</span>
      {SAMPLES.map(({ name, Sample, height }) => (
        <div key={name} class="contents">
          <span class={`${height} pt-2 opacity-60`}>{name}</span>
          <div class={`${height} pt-1`}>
            <Sample drawn state={state} />
          </div>
          <div class={`${height} pt-1`}>
            <Sample drawn={false} state={state} />
          </div>
        </div>
      ))}
    </section>
  );
}
