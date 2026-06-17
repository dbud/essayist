import type { ComponentChildren } from "preact";
import { useErrorBoundary } from "preact/hooks";

interface ErrorBoundaryProps {
  children?: ComponentChildren;
}

export default function ({ children }: ErrorBoundaryProps) {
  const [error, resetError] = useErrorBoundary();

  if (error) {
    // TODO report message, fix style
    return (
      <>
        <p>Something went wrong</p>
        <p>error message: {error.message}</p>
        <button type="button" onClick={resetError}>Try again</button>
      </>
    );
  }

  return children;
}
