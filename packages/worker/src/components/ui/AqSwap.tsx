import { assert } from "@std/assert";
import { cloneElement, isValidElement, type HTMLAttributes, type VNode } from "preact";

import { useAqSwap } from "#/hooks/useAqSwap.ts";

interface AqSwapProps {
  /** The condition the swap fires on; changing it swaps the children. */
  on: string | number | null | undefined;
  /** A single host element: the slot attaches the swap ref and marks it. */
  children: VNode;
}

/** Slot-style swap: takes the host element as its child, merges the swap ref
    and the aq-swap class onto it, and adds no box of its own. Decorate static
    children of the host with data-static so only the changing parts are animated. */
export default function AqSwap({ on, children }: AqSwapProps) {
  const { ref, render } = useAqSwap(on);
  assert(isValidElement(children), "AqSwap expects a single host element as its child");
  const host = children as VNode<HTMLAttributes<HTMLElement>>;
  return cloneElement(host, {
    ref: (node: HTMLElement | null) => {
      ref.current = node;
      if (typeof host.ref === "function") host.ref(node);
      else if (host.ref) host.ref.current = node;
    },
    class: [host.props.class, "aq-swap"].filter((value) => typeof value === "string").join(" "),
    children: render(host.props.children),
  });
}
