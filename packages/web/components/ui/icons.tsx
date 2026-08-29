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
        <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
      )}
    </svg>
  );
}

/** Rounded square outline; filled inner square when selected. */
export function CheckboxIcon({ selected, size = 24 }: ChoiceIconProps) {
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
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {selected && (
        <rect
          x="7.5"
          y="7.5"
          width="9"
          height="9"
          rx="1.5"
          fill="currentColor"
          stroke="none"
        />
      )}
    </svg>
  );
}
