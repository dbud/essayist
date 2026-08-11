import type { Signal } from "@preact/signals";
import { CircleCheckBig, Info, TriangleAlert, X } from "lucide-preact";
import { dismissToast, type Toast, toasts } from "@/signals/toast.ts";

const ICONS = {
  info: Info,
  success: CircleCheckBig,
  error: TriangleAlert,
} as const;

function ToastView({ toast }: { toast: Signal<Toast> }) {
  const { type, message, progress } = toast.value;
  const alertClass = {
    info: "alert--info",
    success: "alert--success",
    error: "alert--error",
  }[type];
  const Icon = ICONS[type];
  const pct =
    progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div role="alert" class={`alert ${alertClass} p-3`}>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <Icon size={16} class="shrink-0" />
          <span class="text-xs">{message}</span>
        </div>
        <button
          type="button"
          class="btn btn--ghost"
          onClick={() => dismissToast(toast)}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      {progress && (
        <div
          class="toast-progress"
          role="progressbar"
          aria-valuenow={progress.done}
          aria-valuemax={progress.total}
          aria-label="Progress"
        >
          <div class="toast-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function Toaster() {
  return (
    <div class="toast">
      {toasts.value.map((toast) => (
        <ToastView key={toast.value.id} toast={toast} />
      ))}
    </div>
  );
}
