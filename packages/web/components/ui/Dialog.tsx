import { type Signal, useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import Panel from "@/components/ui/Panel.tsx";

interface DialogProps {
  open: Signal<boolean>;
  children: ComponentChildren;
}

/** Modal dialog using native <dialog> with Panel animation.
 *  Two signals decouple dialog visibility from Panel animation:
 *  - open: controls showModal/close
 *  - panelOpen: controls the Panel's is-open/is-closed class
 *  On open: showModal first, then rAF to set panelOpen so the browser
 *  renders the 0fr state before transitioning to 1fr.
 *  On close: panelOpen flips to false (by close, useEffect, or consumer),
 *  Panel animates closed, then onSettled calls dialog.close(). */
export default function Dialog({ open, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const panelOpen = useSignal(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open.value && !dialog.open) {
      dialog.showModal();
      panelOpen.value = false;
      requestAnimationFrame(() => {
        panelOpen.value = true;
      });
    } else if (!open.value && dialog.open) {
      panelOpen.value = false;
    }
  }, [open.value]);

  function onSettled() {
    const dialog = ref.current;
    if (!dialog) return;
    if (!panelOpen.value && dialog.open) {
      dialog.close();
    }
  }

  function close() {
    if (!open.value) return;
    panelOpen.value = false;
    open.value = false;
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled by onClose
    <dialog
      ref={ref}
      class="dialog-backdrop"
      onClose={close}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) close();
      }}
    >
      <Panel
        open={panelOpen.value}
        class="bg-surface text-ink shadow-md"
        onSettled={onSettled}
      >
        <div class="content-layout">
          <div class="content-main pt-10 pb-32 min-w-0 max-w-lg">
            {children}
          </div>
        </div>
      </Panel>
    </dialog>
  );
}
