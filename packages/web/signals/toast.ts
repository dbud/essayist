import { type Signal, signal } from "@preact/signals";

export type ToastType = "info" | "success" | "error";

export interface Toast {
  message: string;
  type: ToastType;
  /** Optional progress bar; omitted for plain notifications. */
  progress?: { done: number; total: number };
}

const toasts = signal<Signal<Toast>[]>([]);

/**
 * Push a toast and return its signal. Write to the signal directly to update
 * the toast in place (`toast.value = { ...toast.value, message }`); call
 * `dismissToast(toast)` to remove it.
 */
export function showToast(
  message: string,
  type: ToastType = "info",
  progress?: { done: number; total: number },
): Signal<Toast> {
  const toast = signal<Toast>({ message, type, progress });
  toasts.value = [...toasts.value, toast];
  return toast;
}

/** Remove a toast by its signal reference. */
export function dismissToast(toast: Signal<Toast>): void {
  toasts.value = toasts.value.filter((t) => t !== toast);
}

export { toasts };
