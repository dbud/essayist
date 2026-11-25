import { RotateCcw, TriangleAlert } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useErrorBoundary } from "preact/hooks";

import Melt from "#/components/ui/Melt.tsx";

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
      <div class="flex flex-1 min-h-0 h-full items-center justify-center p-6 bg-paper striped pointer-events-auto">
        <Melt class="flex flex-col items-end gap-4 w-full max-w-128">
          <div class="menu flex flex-col gap-2 self-stretch">
            <div class="flex items-center gap-2">
              <TriangleAlert size={16} class="text-accent" />
              <span>Something went wrong</span>
            </div>
            <pre class="font-mono text-xs opacity-70 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </div>
          <div class="flex gap-4">
            <button type="button" class="btn" onClick={resetError}>
              Try again
            </button>
            <button type="button" class="btn" onClick={() => location.reload()}>
              <RotateCcw />
              <span>Reload</span>
            </button>
          </div>
        </Melt>
      </div>
    );
  }

  return children;
}
