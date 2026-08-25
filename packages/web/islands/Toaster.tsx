import type { Signal } from "@preact/signals";
import { CircleCheckBig, Info, TriangleAlert, X } from "lucide-preact";
import {
  dismissToast,
  removeToast,
  type Toast,
  toasts,
} from "@/signals/toast.ts";

const ICONS = {
  info: Info,
  success: CircleCheckBig,
  error: TriangleAlert,
} as const;

function ToastView({ toast }: { toast: Signal<Toast> }) {
  const { type, message, progress, dismissing } = toast.value;
  const alertClass = {
    info: "alert--info",
    success: "alert--success",
    error: "alert--error",
  }[type];
  const Icon = ICONS[type];
  const pct =
    progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div class={`alert ${alertClass}`} role="alert">
      <div
        class={`alert-inner ${dismissing ? "toast-leave" : "toast-enter"}`}
        onAnimationEnd={(e) => {
          if (e.animationName === "toast-out") removeToast(toast);
        }}
      >
        <div class="flex p-2 gap-2">
          <Icon size={14} class="shrink-0" />
          <span>{message}</span>
          <button
            type="button"
            class="btn--ghost ms-auto"
            onClick={() => dismissToast(toast)}
            aria-label="Dismiss"
          >
            <X size={16} />
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
