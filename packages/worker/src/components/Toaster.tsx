import type { Signal } from "@preact/signals";
import { CircleCheckBig, Info, TriangleAlert, X } from "lucide-preact";

import Melt from "#/components/ui/Melt.tsx";
import { dismissToast, removeToast, type Toast, toasts } from "#/models/utils/toast.ts";

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
  const pct = progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0;
  return (
    <div
      class={`alert ${alertClass} ${dismissing ? "toast-leave" : "toast-enter"}`}
      role="alert"
      onAnimationEnd={(e) => {
        if (e.animationName === "toast-out") removeToast(toast);
      }}
    >
      <div class="flex items-start p-2 gap-2 leading-4">
        <Icon size={16} class="shrink-0" />
        <span class="flex-1">{message}</span>
        <button
          type="button"
          class="toast-close"
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
  );
}

export function Toaster() {
  return (
    <div class="toast">
      <Melt class="flex flex-col-reverse gap-5">
        {toasts.value.map((toast) => (
          <ToastView key={toast.value.id} toast={toast} />
        ))}
      </Melt>
    </div>
  );
}
