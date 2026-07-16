import { useSignal } from "@preact/signals";
import { IS_BROWSER } from "fresh/runtime";
import { useEffect } from "preact/hooks";

/**
 * Reactive media-query signal. Returns a Signal<boolean> tracking whether the
 * given media query currently matches. SSR-safe: reports `false` until mounted
 * on the client, then updates to the real match (and on subsequent changes).
 */
export function useMediaQuery(query: string) {
  const matches = useSignal(false);

  useEffect(() => {
    if (!IS_BROWSER) return;
    const mql = globalThis.matchMedia(query);
    matches.value = mql.matches;

    const onChange = () => {
      matches.value = mql.matches;
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
