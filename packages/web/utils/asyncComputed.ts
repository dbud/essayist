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
 * `deps` is tracked; on any change `compute` runs after `debounceMs` of quiet.
 * The result is cached with deep equality (via `deepComputed`) so downstream
 * effects refire only on structural changes.
 *
 * Each run gets an AbortSignal. When inputs change, or a newer run supersedes
 * an in-flight one, the previous signal is aborted so `compute` can abandon
 * stale work. Aborted runs are dropped silently; the latest completing run
 * clears `stale`. A run rejected with an AbortError its own signal did not
 * raise (e.g. a shared worker was terminated by another caller) gives up and
 * clears `stale` itself, so the UI does not get stuck "resolving".
 */
export interface AsyncComputed<T> {
  value: ReadonlySignal<T>;
  stale: Signal<boolean>;
}

export function asyncComputed<D, T>(
  deps: () => D,
  compute: (deps: D, signal: AbortSignal) => Promise<T>,
  opts: { debounce?: number; initial: T },
): AsyncComputed<T> {
  const out = signal<T>(opts.initial);
  const stale = signal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let first = true;
  let seq = 0;
  let current: AbortController | null = null;

  function run(d: D): void {
    const runSeq = ++seq;
    // Supersede any in-flight compute so it can stop early.
    current?.abort();
    current = new AbortController();
    const { signal } = current;
    compute(d, signal)
      .then((result) => {
        // `!signal.aborted` also drops a run that settled during a debounce
        // window after its inputs already changed.
        if (runSeq === seq && !signal.aborted) {
          out.value = result;
          stale.value = false;
        }
      })
      .catch((err) => {
        // Own abort (newer run / input change): silent; the newer run clears stale.
        if (signal.aborted) return;
        // External cancellation with no newer run pending: give up, keep last value.
        if (isAbortError(err) && runSeq === seq) {
          stale.value = false;
          return;
        }
        console.error("asyncComputed: compute threw:", err);
        if (runSeq === seq) stale.value = false;
      });
  }

  effect(() => {
    const d = deps();
    stale.value = true;
    if (first) {
      first = false;
      run(d);
      return;
    }
    // Abort in-flight right away so we don't finish a result whose inputs are stale.
    current?.abort();
    clearTimeout(timer);
    timer = setTimeout(() => run(d), opts.debounce ?? 0);
  });

  return { value: deepComputed(() => out.value), stale };
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === "AbortError";
}
