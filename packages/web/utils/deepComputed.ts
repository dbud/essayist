import { computed, type ReadonlySignal } from "@preact/signals";
import { equal } from "@std/assert/equal";

/**
 * Like `computed()`, but caches the result with deep equality instead of
 * referential equality. Downstream effects and computeds only re-fire when
 * the new value is structurally different from the previous one.
 *
 * This is useful for computeds that produce arrays or objects on every
 * dependency change, where the contents may be unchanged even though the
 * reference is new.
 */
export function deepComputed<T>(fn: () => T): ReadonlySignal<T> {
  const inner = computed(fn);
  let last = inner.peek();

  return computed(() => {
    const next = inner.value;
    if (equal(last, next)) return last;
    last = next;
    return next;
  });
}
