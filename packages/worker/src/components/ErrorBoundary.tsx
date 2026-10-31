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
      <div class="flex flex-1 min-h-0 p-5 striped bg-paper">
        <div class="m-auto w-full max-w-xl flex flex-col stack stack--row stack--col shadow-md">
          <div class="cell cell--ink flex gap-1">
            <TriangleAlert size={14} />
            Something went wrong
          </div>
          <div class="cell--data min-w-0 break-words">
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
