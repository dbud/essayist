import { effect, type Signal, signal, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

const cache = new Map<string, Signal<unknown>>();

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

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

  if (typeof window !== "undefined") {
    effect(() => {
      localStorage.setItem(key, JSON.stringify(s.value));
    });
  }

  cache.set(key, s);
  return s;
}

export function usePersistentSignal<T>(key: string, fallback: T) {
  const s = useSignal<T>(fallback);
  const skipNextPersist = useRef(false);

  useEffect(() => {
    skipNextPersist.current = true;
    s.value = readStored(key, fallback);
  }, [key, fallback]);

  useEffect(() => {
    if (typeof window === "undefined") return;

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
