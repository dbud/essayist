import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

interface SwappableProps {
  /** A value that identifies the current content. Changing it triggers the swap animation. */
  swapKey: string | number | null | undefined;
  /**
   * Animation variant: a Tailwind utility class like `swap-slide` or `swap-rotate`. Defaults to
   * `swap-slide` if omitted.
   */
  class?: string;
  /** Flip the container's width between contents; styling lives in motion.css. */
  fluid?: boolean;
  children: ComponentChildren;
}

const release = (container: HTMLSpanElement) => {
  container.style.width = "";
  delete container.dataset.swapWidth;
};

export default function Swappable({
  swapKey,
  class: className = "swap-slide",
  fluid,
  children,
}: SwappableProps) {
  const prevKey = useRef(swapKey);
  const prevChildren = useRef<ComponentChildren>(children);
  const containerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const lock = useRef<string | null>(null);
  const outgoing = useSignal<{
    children: ComponentChildren;
    key: string | number | null | undefined;
  } | null>(null);

  if (swapKey !== prevKey.current) {
    outgoing.value = { children: prevChildren.current, key: prevKey.current };
    prevKey.current = swapKey;
    if (fluid && innerRef.current !== null) {
      lock.current = `${innerRef.current.offsetWidth}px`;
    }
  }
  prevChildren.current = children;

  const out = outgoing.value;

  useLayoutEffect(() => {
    if (!fluid || lock.current === null) {
      return;
    }
    const container = containerRef.current;
    const inner = innerRef.current;
    if (container === null || inner === null) {
      return;
    }
    const from = lock.current;
    lock.current = null;
    const to = `${inner.offsetWidth}px`;
    if (from === to) {
      return;
    }
    container.style.width = from;
    void container.offsetWidth;
    container.dataset.swapWidth = "";
    container.style.width = to;
    return () => release(container);
  }, [swapKey, fluid]);

  return (
    <span ref={containerRef} class={`swappable ${className}`}>
      {out !== null && (
        <span
          key={`out-${out.key ?? ""}`}
          class="swappable-out"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) {
              outgoing.value = null;
              if (fluid && containerRef.current !== null) {
                release(containerRef.current);
              }
            }
          }}
        >
          {out.children}
        </span>
      )}
      <span ref={innerRef} key={`in-${swapKey ?? ""}`} class={out !== null ? "swappable-in" : ""}>
        {children}
      </span>
    </span>
  );
}
