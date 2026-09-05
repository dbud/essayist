/** Label + single-line input row. */
export function TextRow({
  label,
  value,
  onInput,
  disabled,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: "text" | "number";
}) {
  return (
    <>
      <span class="cell">{label}</span>
      <input
        type={type}
        class="input-text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </>
  );
}
