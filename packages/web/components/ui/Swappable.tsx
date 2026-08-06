import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";

interface SwappableProps {
  /** A value that identifies the current content. Changing it triggers the swap animation. */
  swapKey: string | number | null | undefined;
  /**
   * Animation variant: a Tailwind utility class like `swap-slide` or `swap-rotate`.
   * Defaults to `swap-slide` if omitted.
   */
  class?: string;
  children: ComponentChildren;
}

export default function Swappable({
  swapKey,
  class: className = "swap-slide",
  children,
}: SwappableProps) {
  const prevKey = useRef(swapKey);
  const prevChildren = useRef<ComponentChildren>(children);
  const outgoing = useSignal<{
    children: ComponentChildren;
    key: string | number | null | undefined;
  } | null>(null);

  if (swapKey !== prevKey.current) {
    outgoing.value = { children: prevChildren.current, key: prevKey.current };
    prevKey.current = swapKey;
  }
  prevChildren.current = children;

  const out = outgoing.value;

  return (
    <span class={`swappable ${className}`}>
      {out !== null && (
        <span
          key={`out-${out.key ?? ""}`}
          class="swappable-out"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) outgoing.value = null;
          }}
        >
          {out.children}
        </span>
      )}
      <span
        key={`in-${swapKey ?? ""}`}
        class={out !== null ? "swappable-in" : ""}
      >
        {children}
      </span>
    </span>
  );
}
