import type { Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";

// Guard signal writes with deep equality so subscribers re-fire only on real changes.
export function setIfChanged<T>(signal: Signal<T>, newValue: T): void {
  if (!equal(signal.value, newValue)) signal.value = newValue;
}
