import type { ComponentChildren } from "preact";

import WaveBars from "#/components/ui/WaveBars.tsx";

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
 * action row bleeding over the frame. */
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
      <div class="swiss-cell swiss-cell--ink">{title}</div>
      <div class="swiss-form-grid swiss-stack--row">
        {children}
        {error && (
          <div role="alert" class="swiss-cell--data col-span-2 whitespace-[normal] text-red-500">
            {error}
          </div>
        )}
        <div class="swiss-form-actions">
          <button type="button" class="swiss-btn" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            class="swiss-btn swiss-cell--accent relative w-30"
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
