/** Label + single-line input row. */
export function TextRow({
  label,
  value,
  onInput,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <span class="cell">{label}</span>
      <input
        class="input-text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </>
  );
}
