import { useSignal } from "@preact/signals";
import { ChevronLeft, ChevronRight } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface TabsProps {
  /** Tab elements, rendered in order inside the scrollable strip. */
  children: ComponentChildren;
  /** Index of the active tab, scrolled into view on change (-1 if none). */
  activeIndex: number;
}

/**
 * Horizontal tab strip that stays on one row: hides the native scrollbar,
 * shows < > buttons only when content overflows (disabled when the direction
 * isn't available), and keeps the active tab scrolled into view.
 */
export default function Tabs({ children, activeIndex }: TabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canLeft = useSignal(false);
  const canRight = useSignal(false);
  const overflow = useSignal(false);

  const update = () => {
    const el = scrollRef.current;
    if (el === null) return;
    overflow.value = el.scrollWidth > el.clientWidth + 1;
    canLeft.value = el.scrollLeft > 0;
    // 1px tolerance for sub-pixel rounding
    canRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
  };

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // Track scroll + container resize.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    update();
    const onScroll = () => update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, []);

  // Recompute after each render (covers tab set / size changes).
  useEffect(() => {
    requestAnimationFrame(update);
  });

  // Keep the active tab in view (only if it's not already visible).
  useEffect(() => {
    if (activeIndex < 0) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el === null) return;
      const tab = el.children[activeIndex] as HTMLElement | undefined;
      if (tab === undefined) return;
      const tabRect = tab.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      let delta = 0;
      if (tabRect.left < elRect.left) delta = tabRect.left - elRect.left;
      else if (tabRect.right > elRect.right)
        delta = tabRect.right - elRect.right;
      if (delta !== 0) el.scrollBy({ left: delta, behavior: "smooth" });
    });
  }, [activeIndex]);

  return (
    <div class="flex items-stretch">
      {overflow.value && (
        <button
          type="button"
          class={`tab shrink-0 bg-base-200 ${
            canLeft.value ? "" : "text-base-content/30"
          }`}
          disabled={!canLeft.value}
          onClick={() => scrollBy(-1)}
          title="Scroll left"
          aria-label="Scroll left"
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <div
        ref={scrollRef}
        class="tabs bg-base-200 flex-nowrap overflow-x-auto flex-1 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {overflow.value && (
        <button
          type="button"
          class={`tab shrink-0 bg-base-200 ${
            canRight.value ? "" : "text-base-content/30"
          }`}
          disabled={!canRight.value}
          onClick={() => scrollBy(1)}
          title="Scroll right"
          aria-label="Scroll right"
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
