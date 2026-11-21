import { useLucideContext } from "lucide-preact";

interface ChoiceIconProps {
  size?: number;
  selected?: boolean;
}

interface IconProps {
  size?: number;
  class?: string;
}

/** Circle outline with an oversized checkmark; matches the CircleDashed
    outline weight of lucide for pairing in status cells. */
export function CircleCheckIcon({ size, class: className }: IconProps) {
  const width = size ?? useLucideContext().size ?? 24;
  return (
    <svg
      class={className}
      width={width}
      height={width}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m7.5 12.5 3.3 3.3 5.7-6.3" />
    </svg>
  );
}

/** Circle outline; filled disc inside when selected. */
export function RadioIcon({ selected, size }: ChoiceIconProps) {
  const width = size ?? useLucideContext().size ?? 24;
  return (
    <svg
      width={width}
      height={width}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      {selected && <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />}
    </svg>
  );
}

interface CountdownRingProps extends IconProps {
  fraction: number;
}

/** Countdown ring: stroke track with an accent arc spanning `fraction` of the circle,
    draining clockwise from 12 o'clock. */
export function CountdownRingIcon({ fraction, class: className, size }: CountdownRingProps) {
  const width = size ?? useLucideContext().size ?? 24;
  const length = 2 * Math.PI * 10;
  return (
    <svg
      class={className}
      width={width}
      height={width}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="var(--color-stroke)" stroke-width="2" />
      {fraction > 0 && (
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="var(--color-accent)"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-dasharray={`${fraction * length} ${2 * length}`}
          transform="rotate(-90 12 12)"
        />
      )}
    </svg>
  );
}

export type RingSegment = "pending" | "active" | "done" | "failed" | "skipped";

interface SegmentedRingProps extends IconProps {
  segments: readonly RingSegment[];
}

// A segment is a stroke as wide as the band between the two radii, drawn along its middle.
const RING_R_MIN = 3;
const RING_R_MAX = 11;
const RING_R = (RING_R_MIN + RING_R_MAX) / 2;
const RING_LENGTH = 2 * Math.PI * RING_R;
const RING_GAP_DEG = 10;

/** A ring with a segment per step, clockwise from 12 o'clock. An active segment slowly fills
    toward three quarters while it pulses; a segment that ends fills the rest of the way. */
export function SegmentedRingIcon({ segments, class: className, size }: SegmentedRingProps) {
  const width = size ?? useLucideContext().size ?? 24;
  const step = 360 / segments.length;
  const length = ((step - RING_GAP_DEG) / 360) * RING_LENGTH;
  return (
    <svg
      class={["segmented-ring", className].filter(Boolean).join(" ")}
      width={width}
      height={width}
      viewBox="0 0 24 24"
      fill="none"
      stroke-width={RING_R_MAX - RING_R_MIN}
      style={{ "--segment-length": length, "--ring-length": RING_LENGTH }}
      aria-hidden="true"
    >
      {segments.length === 0 && <circle cx="12" cy="12" r={RING_R} stroke="var(--color-stroke)" />}
      {segments.map((state, i) => {
        const angle = -90 + i * step + RING_GAP_DEG / 2;
        const transform = `rotate(${angle} 12 12)`;
        return (
          <g key={i} transform={transform}>
            <circle
              cx="12"
              cy="12"
              r={RING_R}
              stroke="var(--color-stroke)"
              stroke-dasharray={`${length} ${RING_LENGTH}`}
            />
            <circle class={`ring-segment is-${state}`} cx="12" cy="12" r={RING_R} />
          </g>
        );
      })}
    </svg>
  );
}

const KNOB_R1 = 5;
const TRACK_R2 = 8;
const KNOB_TRAVEL = 12;
const STROKE = 1.5;

const TRACK_H = 2 * TRACK_R2;
const TRACK_W = KNOB_TRAVEL + 2 * TRACK_R2;
const VB_W = TRACK_W + STROKE;
const VB_H = TRACK_H + STROKE;
const LINE_HEIGHT = 1.1;

/** Pill track; empty knob at the left end (off), filled at the right (on). */
export function CheckboxIcon({ selected, size }: ChoiceIconProps) {
  const width = size ?? useLucideContext().size ?? 24;
  return (
    <svg
      class={`checkbox-icon${selected ? " is-selected" : ""}`}
      width={(width * VB_W) / VB_H}
      height={width}
      viewBox={`0 0 ${VB_W} ${VB_H * LINE_HEIGHT}`}
      fill="none"
      stroke="currentColor"
      stroke-width={STROKE}
      aria-hidden="true"
      style={{ "--knob-travel": `${KNOB_TRAVEL}px` }}
    >
      <rect x={STROKE / 2} y={STROKE / 2} width={TRACK_W} height={TRACK_H} rx={TRACK_R2} />
      <circle
        class="checkbox-knob"
        cx={TRACK_R2 + STROKE / 2}
        cy={STROKE / 2 + TRACK_H / 2}
        r={KNOB_R1}
      />
    </svg>
  );
}
