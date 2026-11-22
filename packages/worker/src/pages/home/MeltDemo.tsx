import { useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, Highlighter } from "lucide-preact";

import AqSegmented from "#/components/ui/AqSegmented.tsx";
import AqSwap from "#/components/ui/AqSwap.tsx";
import Melt, { meltEnabled } from "#/components/ui/Melt.tsx";
import { simulateContextLoss } from "#/melt/context.ts";

function Buttons() {
  return (
    <Melt class="flex items-center gap-1">
      <button type="button" class="aq-btn">
        Settings
      </button>
      <button type="button" class="aq-btn--accent">
        Review
      </button>
      <button type="button" class="aq-btn--idle">
        Saved
      </button>
      <button type="button" class="aq-btn aq-btn--small">
        B
      </button>
    </Melt>
  );
}

/** A button whose content swaps and resizes, next to a button it melts into. */
function Swap() {
  const busy = useSignal(false);
  return (
    <Melt class="inline-flex items-center gap-1">
      <AqSwap on={busy.value ? "busy" : "idle"}>
        <button
          type="button"
          class={busy.value ? "aq-btn--idle" : "aq-btn--accent"}
          onClick={() => (busy.value = !busy.value)}
        >
          {busy.value ? (
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
    </Melt>
  );
}

const FONTS = ["Serif", "Sans", "Mono"];

/** A dropdown under its trigger, with a selected row. */
function Dropdown() {
  const open = useSignal(false);
  return (
    <Melt class="inline-flex">
      <button
        type="button"
        class="aq-btn--idle"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <span>Aa</span>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class={`aq-dropdown aq-dropdown--origin-start ${open.value ? "is-open" : ""}`}>
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
    </Melt>
  );
}

const PROJECTS = ["Essays", "Letters"];
const FILES = ["Draft.md", "Notes.md", "Outline.md"];

/** A detached dropdown with a bridged panel to the right of its selected row, like the file nav. */
function BridgedDropdown() {
  const open = useSignal(false);
  return (
    <Melt class="inline-flex">
      <button
        type="button"
        class="aq-btn"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <span>Essays / Draft.md</span>
        <ChevronDown class="aq-chevron" />
      </button>
      <div class={`aq-dropdown aq-dropdown--detached ${open.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {PROJECTS.map((project, i) => (
              <li key={project} class="relative flex">
                <button type="button" class={`aq-menu-btn ${i === 0 ? "is-selected" : ""}`}>
                  {project}
                  {i === 0 && <ChevronRight class="absolute right-1" />}
                </button>
                {i === 0 && (
                  <div class={`aq-dropdown--right-bridged ${open.value ? "is-open" : ""}`}>
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
    </Melt>
  );
}

const SEGMENTS = [
  { value: "2s", label: "2s" },
  { value: "5s", label: "5s" },
  { value: "10s", label: "10s" },
  { value: "1 min", label: "1 min" },
];

function Segmented() {
  const value = useSignal("5s");
  return (
    <Melt class="inline-flex text-float-ink">
      <AqSegmented value={value} options={SEGMENTS} label="Interval" />
    </Melt>
  );
}

/** Each effect on a single button, with a neighbour to melt into. */
function Effects() {
  return (
    <Melt class="flex items-center gap-1">
      <button type="button" class="aq-btn--idle">
        Idle
      </button>
      <button type="button" class="aq-btn">
        Float
      </button>
      <button type="button" class="aq-btn melt-rim-white/35">
        Rim
      </button>
      <button type="button" class="aq-btn--accent melt-glow-40">
        Glow
      </button>
      <button type="button" class="aq-btn melt-rim-white/35 melt-stroke-[rgb(255_255_255/0.2)]">
        Rim and stroke
      </button>
    </Melt>
  );
}

const SAMPLES = [
  { name: "buttons", Sample: Buttons, height: "h-16" },
  { name: "swap", Sample: Swap, height: "h-16" },
  { name: "dropdown", Sample: Dropdown, height: "h-52" },
  { name: "bridged", Sample: BridgedDropdown, height: "h-72" },
  { name: "segmented", Sample: Segmented, height: "h-16" },
  { name: "effects", Sample: Effects, height: "h-16" },
];

/** Switches the shader for the whole page. */
export default function MeltDemo() {
  return (
    <section class="grid grid-cols-[6rem_1fr] gap-x-8 px-8 py-4 text-sm">
      <span />
      <span class="flex items-center gap-4 opacity-60">
        <button
          type="button"
          class="underline"
          onClick={() => (meltEnabled.value = !meltEnabled.value)}
        >
          shader: {meltEnabled.value ? "on" : "off"}
        </button>
        <button type="button" class="underline" onClick={() => simulateContextLoss()}>
          lose context for 2s
        </button>
      </span>
      {SAMPLES.map(({ name, Sample, height }) => (
        <div key={name} class="contents">
          <span class={`${height} pt-2 opacity-60`}>{name}</span>
          <div class={`${height} pt-1`}>
            <Sample />
          </div>
        </div>
      ))}
    </section>
  );
}
