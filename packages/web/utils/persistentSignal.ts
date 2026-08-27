import { effect, type Signal, signal, useSignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { useEffect, useRef } from "preact/hooks";

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

// No module-level cache: each model instance owns its own signal so that
// server-side, request-scoped model instances get request-scoped signals.
// On the client each model is a singleton (via the model store), so a key is
// still constructed only once.
export function persistentSignal<T>(key: string, fallback: T): Signal<T> {
  const s = signal<T>(readStored(key, fallback));

  if (IS_BROWSER) {
    effect(() => {
      localStorage.setItem(key, JSON.stringify(s.value));
    });
  }

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
