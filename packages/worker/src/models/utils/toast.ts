import { effect, type Signal, signal } from "@preact/signals";

export type ToastType = "info" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** Optional progress bar. */
  progress?: { done: number; total: number };
  /** Set by dismissToast to play the leave animation before removal. */
  dismissing?: boolean;
}

let count = 0;
const toasts = signal<Signal<Toast>[]>([]);

const DEFAULT_TIMEOUT = 10_000;

/** No progress, or progress complete. */
function isFinished(t: Toast): boolean {
  return !t.progress || t.progress.done >= t.progress.total;
}

/** Push a toast; mutate the returned signal to update, dismissToast to remove. */
export function showToast(
  message: string,
  type: ToastType = "info",
  progress?: { done: number; total: number },
): Signal<Toast> {
  const toast = signal<Toast>({ id: ++count, message, type, progress });
  toasts.value = [...toasts.value, toast];
  // Auto-dismiss finished non-error toasts after DEFAULT_TIMEOUT.
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const t = toast.value;
    if (t.type !== "error" && isFinished(t)) {
      if (timer === undefined) {
        timer = setTimeout(() => dismissToast(toast), DEFAULT_TIMEOUT);
      }
    } else if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  });
  return toast;
}

/** A toast a batch flow drives through its steps. */
export interface TaskToast {
  /** Advance the label, optionally with a progress bar. */
  step(message: string, progress?: { done: number; total: number }): void;
  /** Set the final summary; ok chooses success or error styling. */
  settle(message: string, ok: boolean): void;
}

/** Push a task toast. step and settle rewrite the signal value, so call sites don't repeat that
 * mutation. */
export function showTaskToast(initial: string): TaskToast {
  const toast = showToast(initial);
  return {
    step(message, progress) {
      toast.value = {
        ...toast.value,
        message,
        type: "info",
        progress,
      };
    },
    settle(message, ok) {
      toast.value = {
        ...toast.value,
        message,
        type: ok ? "success" : "error",
        progress: undefined,
      };
    },
  };
}

/** Begin dismissal: plays the leave animation. The animationend listener of
 * the element calls removeToast once the animation finishes. */
export function dismissToast(toast: Signal<Toast>): void {
  if (toast.value.dismissing) return;
  toast.value = { ...toast.value, dismissing: true };
}

/** Remove a toast from the model. Called after the leave animation ends. */
export function removeToast(toast: Signal<Toast>): void {
  toasts.value = toasts.value.filter((t) => t !== toast);
}

export { toasts };
