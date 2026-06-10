import {
  effect,
  type Signal,
  signal,
  useSignal,
  useSignalEffect,
} from "@preact/signals";

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
  const s = useSignal<T>(readStored(key, fallback));

  useSignalEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(s.value));
  });

  return s;
}
