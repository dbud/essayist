import { computed, effect, type ReadonlySignal, signal } from "@preact/signals";

/**
 * Mirrors `source`, but delays the false->true transition by `delay` ms.
 * true->false is immediate. A brief true pulse that ends before `delay`
 * elapses never propagates, so fast background work does not flash the UI.
 */
export function delayedRise(
  source: ReadonlySignal<boolean>,
  delay: number,
): ReadonlySignal<boolean> {
  const out = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  effect(() => {
    if (source.value) {
      clearTimeout(timer);
      timer = setTimeout(() => (out.value = true), delay);
    } else {
      clearTimeout(timer);
      out.value = false;
    }
  });

  return computed(() => out.value);
}
