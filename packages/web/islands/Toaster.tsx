import type { Signal } from "@preact/signals";
import { X } from "lucide-preact";
import { dismissToast, type Toast, toasts } from "@/signals/toast.ts";

function ToastView({ toast }: { toast: Signal<Toast> }) {
  const t = toast.value;
  const alertClass = {
    info: "alert-info",
    success: "alert-success",
    error: "alert-error",
  }[t.type];
  return (
    <div
      role="alert"
      class={`alert ${alertClass} flex flex-col items-stretch gap-2`}
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm">{t.message}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs btn-circle"
          onClick={() => dismissToast(toast)}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      {t.progress && (
        <progress
          class="progress progress-info w-full"
          value={t.progress.done}
          max={t.progress.total}
          aria-label="Progress"
        />
      )}
    </div>
  );
}

export default function Toaster() {
  return (
    <div class="toast toast-end toast-bottom z-50">
      {toasts.value.map((toast, i) => (
        <ToastView key={i} toast={toast} />
      ))}
    </div>
  );
}
