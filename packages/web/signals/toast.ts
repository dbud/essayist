import { effect, type Signal, signal } from "@preact/signals";

export type ToastType = "info" | "success" | "error";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  /** Optional progress bar. */
  progress?: { done: number; total: number };
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

export function dismissToast(toast: Signal<Toast>): void {
  toasts.value = toasts.value.filter((t) => t !== toast);
}

export { toasts };
