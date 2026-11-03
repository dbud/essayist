import { TriangleAlert } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useErrorBoundary } from "preact/hooks";

interface ErrorBoundaryProps {
  children?: ComponentChildren;
}

export default function ErrorBoundary({ children }: ErrorBoundaryProps) {
  const [error, resetError] = useErrorBoundary();

  useEffect(() => {
    if (!error) return;
    void import("@sentry/browser").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  if (error && import.meta.env.SSR) throw error;

  if (error) {
    return (
      <div class="flex flex-1 min-h-0 striped bg-paper">
        <div class="m-auto w-full max-w-128 flex flex-col stack stack--row stack--col shadow-md">
          <div class="cell cell--ink flex gap-1">
            <TriangleAlert size={14} />
            Something went wrong
          </div>
          <div class="cell--data font-mono text-xs min-w-0 overflow-y-auto break-all whitespace-pre-wrap">
            {error instanceof Error ? error.message : String(error)}
          </div>
          <div class="form-actions">
            <button type="button" class="btn" onClick={resetError}>
              Try again
            </button>
            <button type="button" class="btn" onClick={() => location.reload()}>
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
