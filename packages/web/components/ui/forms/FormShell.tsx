import type { ComponentChildren } from "preact";
import WaveBars from "@/components/ui/WaveBars.tsx";

interface FormShellProps {
  title: string;
  submitLabel: string;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (e: Event) => void;
  children: ComponentChildren;
}

/** Entity form shell: ink title bar, ruled label/control grid, Cancel/Save
 *  action row bleeding over the frame. */
export function FormShell({
  title,
  submitLabel,
  submitting,
  error,
  onCancel,
  onSubmit,
  children,
}: FormShellProps) {
  return (
    <form onSubmit={onSubmit} class="flex flex-col text-ink">
      <div class="cell cell--ink">{title}</div>
      <div class="form-grid stack--row">
        {children}
        {error && (
          <div
            role="alert"
            class="cell--data col-span-2 whitespace-[normal] text-red-500"
          >
            {error}
          </div>
        )}
        {/*<div class="col-span-2 separator" />*/}
        <div class="form-actions">
          <button
            type="button"
            class="btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn cell--accent relative w-30"
            disabled={submitting}
          >
            {submitLabel}
            <WaveBars fill amplitude={submitting ? 1 : 0} />
          </button>
        </div>
      </div>
    </form>
  );
}
