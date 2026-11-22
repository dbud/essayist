// Safari has no requestIdleCallback, so it gets a short timeout instead.
const FALLBACK_DELAY = 200;

/** Calls callback when the browser is idle, and returns a function that cancels it. */
export function whenIdle(callback: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = requestIdleCallback(callback);
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(callback, FALLBACK_DELAY);
  return () => clearTimeout(id);
}
