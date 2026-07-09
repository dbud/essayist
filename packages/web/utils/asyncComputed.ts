import {
  effect,
  type ReadonlySignal,
  type Signal,
  signal,
} from "@preact/signals";
import { deepComputed } from "./deepComputed.ts";

/**
 * An async, debounced counterpart to `deepComputed`.
 *
 * `deps` is read eagerly and its signals are tracked; on any change `compute`
 * (which returns a Promise) is scheduled to run after `debounceMs` of quiet.
 * The latest result is cached with deep equality (via `deepComputed`) so
 * downstream effects refire only when the value structurally changes. Stale
 * responses are dropped when a newer request supersedes an in-flight one.
 *
 * `value` holds the latest resolved result (starting at `initial`); `stale` is
 * true while a recompute is pending.
 */
export interface AsyncComputed<T> {
  value: ReadonlySignal<T>;
  stale: Signal<boolean>;
}

export function asyncComputed<D, T>(
  deps: () => D,
  compute: (deps: D) => Promise<T>,
  opts: { debounce?: number; initial: T },
): AsyncComputed<T> {
  const out = signal<T>(opts.initial);
  const stale = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = true;
  let seq = 0;

  function run(d: D): void {
    const runSeq = ++seq;
    // `stale` is set true by the effect when inputs change; the latest
    // completing request clears it.
    compute(d)
      .then((result) => {
        if (runSeq === seq) {
          out.value = result;
          stale.value = false;
        }
      })
      .catch((err) => {
        console.error("asyncComputed: compute threw:", err);
        if (runSeq === seq) stale.value = false;
      });
  }

  effect(() => {
    const d = deps();
    stale.value = true; // inputs changed -> the value is stale until a compute lands
    if (first) {
      first = false;
      run(d); // populate immediately on the first run
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => run(d), opts.debounce ?? 0);
  });

  return { value: deepComputed(() => out.value), stale };
}
