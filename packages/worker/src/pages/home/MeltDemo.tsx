import { useSignal } from "@preact/signals";
import { ChevronDown, ChevronRight, Highlighter } from "lucide-preact";
import { useEffect } from "preact/hooks";

import Melt, {
  meltDebug,
  meltEnabled,
  meltFieldScale,
  meltPixelRatio,
} from "#/components/ui/Melt.tsx";
import Segmented from "#/components/ui/Segmented.tsx";
import Swap from "#/components/ui/Swap.tsx";
import { meltTargetStatus, simulateContextLoss } from "#/melt/context.ts";
import { TIMED_PARTS, type TimedPart, takeFrameStats } from "#/melt/stats.ts";

function Buttons() {
  return (
    <Melt class="flex items-center gap-4">
      <button type="button" class="btn">
        Settings
      </button>
      <button type="button" class="btn--accent">
        Review
      </button>
      <button type="button" class="btn--idle">
        Saved
      </button>
      <button type="button" class="btn btn--small">
        B
      </button>
    </Melt>
  );
}

/** A button whose content swaps and resizes, next to a button it melts into. */
function SwapSample() {
  const busy = useSignal(false);
  return (
    <Melt class="inline-flex items-center gap-1">
      <Swap on={busy.value ? "busy" : "idle"}>
        <button
          type="button"
          class={busy.value ? "btn--idle" : "btn--accent"}
          onClick={() => (busy.value = !busy.value)}
        >
          {busy.value ? (
            <>
              <span>Review in progress</span>
              <ChevronDown class="chevron" />
            </>
          ) : (
            <>
              <Highlighter />
              <span>Review</span>
            </>
          )}
        </button>
      </Swap>
      <button type="button" class="btn">
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
        class="btn--idle"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <span>Aa</span>
        <ChevronDown class="chevron" />
      </button>
      <div class={`dropdown dropdown--origin-start ${open.value ? "is-open" : ""}`}>
        <div class="menu">
          <ul class="menu-rows" data-stagger>
            {FONTS.map((font, i) => (
              <li key={font}>
                <button type="button" class={`menu-btn ${i === 1 ? "is-selected" : ""}`}>
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
        class="btn"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <span>Essays / Draft.md</span>
        <ChevronDown class="chevron" />
      </button>
      <div class={`dropdown dropdown--detached ${open.value ? "is-open" : ""}`}>
        <div class="menu">
          <ul class="menu-rows" data-stagger>
            {PROJECTS.map((project, i) => (
              <li key={project} class="relative flex">
                <button type="button" class={`menu-btn ${i === 0 ? "is-selected" : ""}`}>
                  {project}
                  {i === 0 && <ChevronRight class="absolute right-1" />}
                </button>
                {i === 0 && (
                  <div class={`dropdown--right-bridged ${open.value ? "is-open" : ""}`}>
                    <span class="dropdown-bridge" aria-hidden="true" />
                    <div class="menu">
                      <ul class="menu-rows" data-stagger>
                        {FILES.map((file, j) => (
                          <li key={file}>
                            <button
                              type="button"
                              class={`menu-btn ${j === 0 ? "is-selected" : ""}`}
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

function SegmentedSample() {
  const value = useSignal("5s");
  return (
    <Melt class="inline-flex text-float-ink">
      <Segmented value={value} options={SEGMENTS} label="Interval" />
    </Melt>
  );
}

/** Each effect on a single button, with a neighbour to melt into. */
function Effects() {
  return (
    <Melt class="flex items-center gap-4">
      <button type="button" class="btn--idle">
        Idle
      </button>
      <button type="button" class="btn">
        Float
      </button>
      <button type="button" class="btn melt-rim-white/35">
        Rim
      </button>
      <button type="button" class="btn--accent melt-glow-40">
        Glow
      </button>
      <button type="button" class="btn melt-rim-white/35 melt-stroke-[rgb(255_255_255/0.2)]">
        Rim and stroke
      </button>
    </Melt>
  );
}

/** Frames drawn in the last second, and the melt time of each timed part per frame. */
function useFrameStats() {
  const stats = useSignal<{ fps: number; parts: Partial<Record<TimedPart, number>> }>({
    fps: 0,
    parts: {},
  });
  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    takeFrameStats();
    let request = requestAnimationFrame(function tick(now) {
      frames++;
      if (now - since >= 1000) {
        const totals = takeFrameStats();
        stats.value = {
          fps: Math.round((frames * 1000) / (now - since)),
          parts: Object.fromEntries(TIMED_PARTS.map((part) => [part, totals[part] / frames])),
        };
        frames = 0;
        since = now;
      }
      request = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(request);
  }, []);
  return stats;
}

// The parts of measure() in stats.ts.
const MEASURE_PARTS = ["flush", "styles", "rects", "opacity"] as const;

/** Fixed in a corner, so it stays in view while scrolling to the other samples. */
function FrameStats() {
  const stats = useFrameStats();
  const { fps, parts } = stats.value;
  const ms = (part: TimedPart) => (parts[part] ?? 0).toFixed(1);
  const measure = MEASURE_PARTS.reduce((sum, part) => sum + (parts[part] ?? 0), 0);
  return (
    <div class="fixed right-4 bottom-20 z-toast flex flex-col gap-1 rounded-md bg-float px-3 py-2 font-mono text-xs text-float-ink tabular-nums">
      <span>{fps} fps</span>
      <span>measure {measure.toFixed(1)} ms</span>
      {MEASURE_PARTS.map((part) => (
        <span key={part} class="pl-2 opacity-70">
          {part} {ms(part)}
        </span>
      ))}
      <span>animations {ms("animations")} ms</span>
      <span>layout {ms("layout")} ms</span>
      <span>draw {ms("draw")} ms</span>
      {meltDebug.value && <span>gpu {ms("gpu")} ms</span>}
      {meltDebug.value && <span class="max-w-64 break-words">{meltTargetStatus()}</span>}
      <button
        type="button"
        class="text-left underline opacity-70"
        onClick={() => (meltDebug.value = !meltDebug.value)}
      >
        outlines + gpu: {meltDebug.value ? "on" : "off"}
      </button>
      <button
        type="button"
        class="text-left underline opacity-70"
        onClick={() => (meltFieldScale.value = next(FIELD_SCALES, meltFieldScale.value))}
      >
        field: {meltFieldScale.value === undefined ? "default (1/4)" : `${meltFieldScale.value}×`}
      </button>
    </div>
  );
}

const PIXEL_RATIOS = [undefined, 1, 0.5] as const;
const FIELD_SCALES = [undefined, 0.5, 1] as const;
const BUTTON_COUNTS = [48, 12, 24, 32] as const;

/** The next value after current in a list, wrapping round. */
function next<T>(values: readonly T[], current: T): T {
  return values[(values.indexOf(current) + 1) % values.length];
}

/** A 4 by 12 grid of buttons in a single root, past the shape limit, to test performance. */
function Grid() {
  const animate = useSignal(false);
  const shadows = useSignal(true);
  const count = useSignal<number>(48);
  const ratio = meltPixelRatio.value;
  return (
    <div class="flex flex-col gap-3">
      <span class="flex flex-wrap items-center gap-x-4 gap-y-1 opacity-60">
        <button type="button" class="underline" onClick={() => (animate.value = !animate.value)}>
          animate: {animate.value ? "on" : "off"}
        </button>
        <button
          type="button"
          class="underline"
          onClick={() => (meltPixelRatio.value = next(PIXEL_RATIOS, ratio))}
        >
          resolution: {ratio === undefined ? "device" : `${ratio}×`}
        </button>
        <button type="button" class="underline" onClick={() => (shadows.value = !shadows.value)}>
          shadows: {shadows.value ? "on" : "off"}
        </button>
        <button
          type="button"
          class="underline"
          onClick={() => (count.value = next(BUTTON_COUNTS, count.value))}
        >
          buttons: {count.value}
        </button>
      </span>
      <Melt class="grid w-fit grid-cols-4 gap-4">
        {Array.from({ length: count.value }, (_, i) => (
          <button
            key={i}
            type="button"
            class={`btn justify-center ${animate.value ? "animate-pulse" : ""}`}
            style={{
              animationDelay: animate.value ? `${(i % 8) * -250}ms` : undefined,
              "--melt-shadow": shadows.value ? undefined : "transparent",
            }}
          >
            {i + 1}
          </button>
        ))}
      </Melt>
    </div>
  );
}

const SAMPLES = [
  { name: "grid", Sample: Grid, height: "h-auto" },
  { name: "buttons", Sample: Buttons, height: "h-16" },
  { name: "swap", Sample: SwapSample, height: "h-16" },
  { name: "dropdown", Sample: Dropdown, height: "h-52" },
  { name: "bridged", Sample: BridgedDropdown, height: "h-72" },
  { name: "segmented", Sample: SegmentedSample, height: "h-16" },
  { name: "effects", Sample: Effects, height: "h-16" },
];

/** Switches the shader for the whole page. */
export default function MeltDemo() {
  return (
    <section class="grid grid-cols-[6rem_1fr] gap-x-8 px-8 py-4 text-sm">
      <FrameStats />
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
