import type { Signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface DialogProps {
  open: Signal<boolean>;
  title?: ComponentChildren;
  children: ComponentChildren;
}

/**
 * Reusable daisyUI modal backed by a native `<dialog>`. Open state is owned by
 * the parent (a `Signal<boolean>`) so a trigger anywhere can open it; we mirror
 * it into `dialog.showModal()`/`close()` via an effect. The caller provides the
 * body — including any `<form>` and `modal-action` buttons — so form submission
 * stays local to the consuming component.
 */
export default function Dialog({ open, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open.value && !dialog.open) dialog.showModal();
    else if (!open.value && dialog.open) dialog.close();
  }, [open.value]);

  return (
    <dialog ref={ref} class="modal">
      <div class="modal-box">
        {title != null && <h3 class="text-lg font-semibold">{title}</h3>}
        {children}
      </div>
      <form method="dialog" class="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}
