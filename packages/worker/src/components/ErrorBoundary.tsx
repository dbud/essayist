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
      <div class="flex flex-col stack stack--col shadow-md text-sm">
        <div class="cell cell--ink">Something went wrong</div>
        <div class="cell--data min-w-0 break-words">
          {error instanceof Error ? error.message : String(error)}
        </div>
        <div class="form-actions">
          <button type="button" class="btn" onClick={resetError}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return children;
}
