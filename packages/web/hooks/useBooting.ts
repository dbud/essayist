import { type ReadonlySignal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

/**
 * True until the first client render has committed, false afterwards. Both
 * the SSR output and the first client render see `true`, so components can
 * show a boot state (e.g. an animation) without diverging from the server
 * HTML during hydration.
 */
export function useBooting(): ReadonlySignal<boolean> {
  const booting = useSignal(true);
  useEffect(() => {
    booting.value = false;
  }, []);
  return booting;
}
