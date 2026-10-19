import type { Signal } from "@preact/signals";
import { useCallback, useEffect, useRef } from "preact/hooks";

export type ScrollContainerRef = { current: HTMLDivElement | null };

/**
 * Tracks a scroll container's `scrollTop` and `clientHeight` into the given
 * signals, used to derive offscreen-sidenote ghosts. Scroll events are
 * coalesced via requestAnimationFrame. Returns a ref to attach to the scroll
 * container.
 */
export function useScrollViewport(
  scrollTop: Signal<number>,
  viewportHeight: Signal<number>,
): ScrollContainerRef {
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    scrollTop.value = el.scrollTop;
    viewportHeight.value = el.clientHeight;
  }, [scrollTop, viewportHeight]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [update]);

  return ref;
}
