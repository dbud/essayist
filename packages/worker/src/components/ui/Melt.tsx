import { signal } from "@preact/signals";
import type { ComponentChildren, RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

import { attachMelt } from "#/melt/attach.ts";
import { MELT_ROOT } from "#/melt/discover.ts";

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

  useLayoutEffect(() => {
    const node = root.current;
    if (node === null) return;
    const detach = enabled ? attachMelt(node) : undefined;
    delete node.dataset.meltPending;
    return detach;
  }, [enabled, root]);

  // The server renders the root pending, hidden until the canvas can draw it after hydration, so
  // the page never shows its shapes unmelted first. Hydration keeps the attribute of the server,
  // and client renders never add it, so a root mounted later doesn't fade in.
  return (
    <div
      ref={root}
      class={extra === undefined ? MELT_ROOT : `${MELT_ROOT} ${extra}`}
      data-melt-pending={import.meta.env.SSR ? "" : undefined}
    >
      {children}
    </div>
  );
}
