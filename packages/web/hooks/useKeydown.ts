import { useEffect, useRef } from "preact/hooks";

export function useKeydown(onKeyDown: (e: KeyboardEvent) => void) {
  const ref = useRef(onKeyDown);
  ref.current = onKeyDown;

  useEffect(() => {
    const listener = (e: KeyboardEvent) => ref.current(e);
    globalThis.addEventListener("keydown", listener);
    return () => globalThis.removeEventListener("keydown", listener);
  }, []);
}
