import { useEffect, useState } from "preact/hooks";

/**
 * Re-renders the calling component every `ms` milliseconds. Use for
 * UI that goes stale on its own, like relative time labels.
 */
export function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
