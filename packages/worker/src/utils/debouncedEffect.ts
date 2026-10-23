import { effect, type ReadonlySignal } from "@preact/signals";

/**
 * Runs `action` after the source changes, waiting `delay` for the changes to
 * settle first. Every change restarts the wait, so the action runs once the
 * source stops changing. `onHide` runs when the page is hidden, for writes
 * that have to survive the unload. Returns a disposer.
 */
export function debouncedEffect(
  source: ReadonlySignal<unknown>,
  action: () => void,
  options: {
    readonly delay: () => number;
    readonly onHide?: () => void;
  },
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = effect(() => {
    source.value;
    clearTimeout(timer);
    timer = setTimeout(action, options.delay());
  });
  const onHide = () => options.onHide?.();
  globalThis.addEventListener("pagehide", onHide);
  return () => {
    dispose();
    clearTimeout(timer);
    globalThis.removeEventListener("pagehide", onHide);
  };
}
