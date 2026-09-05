interface ChoiceIconProps {
  size?: number;
  selected?: boolean;
}

/** Circle outline; filled disc inside when selected. */
export function RadioIcon({ selected, size = 24 }: ChoiceIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      {selected && (
        <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
      )}
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
export function CheckboxIcon({ selected, size = 24 }: ChoiceIconProps) {
  return (
    <svg
      class={`checkbox-icon${selected ? " is-selected" : ""}`}
      width={(size * VB_W) / VB_H}
      height={size}
      viewBox={`0 0 ${VB_W} ${VB_H * LINE_HEIGHT}`}
      fill="none"
      stroke="currentColor"
      stroke-width={STROKE}
      aria-hidden="true"
      style={{ "--knob-travel": `${KNOB_TRAVEL}px` }}
    >
      <rect
        x={STROKE / 2}
        y={STROKE / 2}
        width={TRACK_W}
        height={TRACK_H}
        rx={TRACK_R2}
      />
      <circle
        class="checkbox-knob"
        cx={TRACK_R2 + STROKE / 2}
        cy={STROKE / 2 + TRACK_H / 2}
        r={KNOB_R1}
      />
    </svg>
  );
}
