import { effect, type ReadonlySignal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

// Fraction of `intervalSeconds` still remaining since `source` last changed, shrinking to 0 as the
// countdown completes. Runs a per-frame loop while mounted.
export function useCountdown(
  source: ReadonlySignal<unknown>,
  intervalSeconds: number,
): ReadonlySignal<number> {
  const changedAt = useSignal(0);
  useEffect(() => {
    return effect(() => {
      void source.value;
      changedAt.value = Date.now();
    });
  }, [source]);

  const fraction = useSignal(1);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const elapsed = (Date.now() - changedAt.value) / (intervalSeconds * 1000);
      fraction.value = Math.max(0, 1 - elapsed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [intervalSeconds]);
  return fraction;
}
