import { effect, type Signal, signal } from "@preact/signals";
import { equal } from "@std/assert";

export function computedBy<T>(
  compute: () => T | null,
  keyOf: (value: T) => unknown,
): Signal<T | null> {
  const out = signal<T | null>(compute());
  let initial = true;
  let prev = out.peek();

  effect(() => {
    const next = compute();

    if (initial) {
      initial = false;
      prev = next;
      out.value = next;
      return;
    }

    if (Object.is(prev, next)) return;

    if (prev === null || next === null) {
      prev = next;
      out.value = next;
      return;
    }

    if (!equal(keyOf(prev), keyOf(next))) {
      prev = next;
      out.value = next;
    }
  });

  return out;
}
