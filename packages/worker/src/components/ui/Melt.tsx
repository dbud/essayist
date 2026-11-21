import { signal } from "@preact/signals";
import type { ComponentChildren, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

import { attachMelt } from "#/melt/attach.ts";

/** Turns the melt canvas on or off for the whole page. */
export const meltEnabled = signal(true);

interface MeltProps {
  class?: string;
  ref?: RefObject<HTMLDivElement | null>;
  children: ComponentChildren;
}

/** The root of a melt group. Its shapes, and the groups inside it, are drawn on a canvas behind
    its content. */
export default function Melt({ class: extra, ref, children }: MeltProps) {
  const own = useRef<HTMLDivElement>(null);
  const root = ref ?? own;
  const enabled = meltEnabled.value;

  useEffect(() => {
    if (!enabled || root.current === null) return;
    return attachMelt(root.current);
  }, [enabled, root]);

  return (
    <div ref={root} class={extra === undefined ? "aq-melt" : `aq-melt ${extra}`}>
      {children}
    </div>
  );
}
