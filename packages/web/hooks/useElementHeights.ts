import type { Signal } from "@preact/signals";
import { equal } from "@std/assert/equal";
import { useCallback, useEffect, useLayoutEffect, useRef } from "preact/hooks";

interface UseElementHeightsOptions {
  /** CSS selector for the elements to measure (scoped to the container). */
  selector: string;
  /** dataset key (without the `data-` prefix) used as the map key. */
  key: string;
  /** Extra values that should trigger a re-measure (e.g. the entry list). */
  deps?: unknown[];
}

/**
 * Measures the `offsetHeight` of every element matching `selector` within a
 * container, keyed by `data-[key]`, and publishes the result into `output`.
 * Re-measures on `deps` changes and on container resize (a width change reflows
 * the measured content). Returns a ref to attach to the container element.
 *
 * Skips the write when heights are unchanged, so callers can depend on a value
 * derived from `output` without looping. The container's size must be
 * independent of the measured elements' positions (e.g. they are absolutely
 * positioned) so repositioning doesn't re-trigger the ResizeObserver.
 */
export function useElementHeights<T extends HTMLElement>(
  output: Signal<Map<string, number>>,
  { selector, key, deps = [] }: UseElementHeightsOptions,
) {
  const containerRef = useRef<T>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const next = new Map<string, number>();
    for (const el of container.querySelectorAll<HTMLElement>(selector)) {
      const id = el.dataset[key];
      if (id) next.set(id, el.offsetHeight);
    }
    if (equal(output.value, next)) return;
    output.value = next;
  }, [output, selector, key]);

  useLayoutEffect(measure, [...deps, measure]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [measure]);

  return containerRef;
}
