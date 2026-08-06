import { useEffect, useRef } from "preact/hooks";

/**
 * Calls `onClickOutside` when a click lands outside `ref.current`.
 * Only listens while the callback is defined. Returns the ref so callers
 * can attach it to an element.
 */
export function useClickOutside(onClickOutside?: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onClickOutside) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [onClickOutside]);

  return ref;
}
