import { effect, type Signal, signal, useSignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { useEffect, useRef } from "preact/hooks";

const cache = new Map<string, Signal<unknown>>();

function readStored<T>(key: string, fallback: T): T {
  if (!IS_BROWSER) return fallback;

  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function persistentSignal<T>(key: string, fallback: T): Signal<T> {
  const existing = cache.get(key);
  if (existing) return existing as Signal<T>;

  const s = signal<T>(readStored(key, fallback));

  if (IS_BROWSER) {
    effect(() => {
      localStorage.setItem(key, JSON.stringify(s.value));
    });
  }

  cache.set(key, s);
  return s;
}

/**
 * A persistent signal whose storage key is derived from other signals. When
 * the key changes (because a signal `buildKey` reads changed), the signal
 * re-reads from the new key; subsequent writes go to the new key. This lets
 * per-scope state (e.g. per-workspace opened files) emerge from a scope signal
 * like `currentWorkspaceId` without manual reset effects.
 *
 * The load effect tracks the scope (via `buildKey`); the persist effect
 * tracks only the value, reading the current key from a closure var the load
 * effect keeps fresh. This avoids the race where a scope change would otherwise
 * clobber the newly-keyed storage with the old value.
 */
export function scopedPersistentSignal<T>(
  buildKey: () => string,
  fallback: T,
): Signal<T> {
  const s = signal<T>(IS_BROWSER ? readStored(buildKey(), fallback) : fallback);

  if (!IS_BROWSER) return s;

  let currentKey = buildKey();

  // Re-load when the key changes (tracks whatever buildKey reads).
  effect(() => {
    currentKey = buildKey();
    s.value = readStored(currentKey, fallback);
  });

  // Persist on value change. Tracks ONLY s.value; the key comes from the
  // closure var above (untracked), so a scope change doesn't trigger a write.
  let lastValue = s.value;
  effect(() => {
    const v = s.value;
    if (v === lastValue) return;
    lastValue = v;
    try {
      localStorage.setItem(currentKey, JSON.stringify(v));
    } catch {
      // ignore storage/serialisation errors
    }
  });

  return s;
}

export function usePersistentSignal<T>(key: string, fallback: T) {
  const s = useSignal<T>(fallback);
  const skipNextPersist = useRef(false);

  useEffect(() => {
    skipNextPersist.current = true;
    s.value = readStored(key, fallback);
  }, [key]);

  useEffect(() => {
    if (!IS_BROWSER) return;

    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }

    try {
      localStorage.setItem(key, JSON.stringify(s.value));
    } catch {
      // ignore storage/serialisation errors
    }
  }, [key, s.value]);

  return s;
}
