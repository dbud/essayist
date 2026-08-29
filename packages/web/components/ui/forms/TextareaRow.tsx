import { useEffect, useRef } from "preact/hooks";

/** Label + textarea sized to fit its content (lines) plus the gap at the
 *  bottom. */
export function TextareaRow({
  label,
  value,
  onInput,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onInput: (value: string) => void;
  rows: number;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // a 0 scrollHeight means the dialog is not laid out yet (display none /
    // collapsed pane): the rows attribute floor applies instead.
    if (el.scrollHeight === 0) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <>
      <span class="cell--data text-ink/60">{label}</span>
      <textarea
        ref={textareaRef}
        class="input-text block h-[auto] min-w-0 resize-none"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onInput={(e) => onInput(e.currentTarget.value)}
      />
    </>
  );
}
