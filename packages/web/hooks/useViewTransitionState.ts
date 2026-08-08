import { type ReadonlySignal, useSignal } from "@preact/signals";
import { equal } from "@std/assert";
import { useEffect } from "preact/hooks";

type DisplayedState<T> = { state: "data"; data: T } | { state: "loading" };

/** Mirrors a data value + loading bool into a single `displayed` signal that
 *  transitions between loading and data states using the View Transitions API.
 *  Call with the current data and loading values on each render; the hook
 *  triggers a cross-fade transition only when the content actually changes. */
export function useViewTransitionState<T>(
  data: T,
  loading: boolean,
): ReadonlySignal<DisplayedState<T>> {
  const displayed = useSignal<DisplayedState<T>>({ state: "loading" });

  useEffect(() => {
    const next: DisplayedState<T> = loading
      ? { state: "loading" }
      : { state: "data", data };
    if (equal(next, displayed.value)) return;
    if (!document.startViewTransition) {
      displayed.value = next;
      return;
    }
    const transition = document.startViewTransition(() => {
      displayed.value = next;
    });
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  }, [data, loading]);

  return displayed;
}
