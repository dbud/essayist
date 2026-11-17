import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

export interface AqSwapState {
  /** Attach to the host element; the swap drives its phases and size. */
  ref: { current: HTMLElement | null };
  /** Wraps the content children: held content during swaps, fresh when idle. */
  render(content: ComponentChildren): ComponentChildren;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function animationsSettled(animations: Animation[]): Promise<void> {
  if (animations.length === 0) return Promise.resolve();
  return Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {});
}

/** The animations on the swapping parts; their timing sources the size flip. */
function partAnimations(node: HTMLElement): Animation[] {
  return swapParts(node).flatMap((element) => element.getAnimations());
}

/** The direct host children that carry no data-static mark. */
function swapParts(node: HTMLElement): Element[] {
  return [...node.children].filter((child) => !child.hasAttribute("data-static"));
}

/** A sequential content swap: the held content runs the out animation, the
    children patch in place, the new content runs the in animation, and the
    host eases between the two sizes. */
export function useAqSwap(on: string | number | null | undefined): AqSwapState {
  const held = useSignal<ComponentChildren>(null);
  const ref = useRef<HTMLElement | null>(null);
  const running = useRef(false);
  const lastOn = useRef(on);
  // The content of the last commit, i.e. what the element holds while idle.
  const shown = useRef<ComponentChildren>(null);

  useLayoutEffect(() => {
    if (held.value === null || running.current) return;
    running.current = true;
    void swap();
  });

  async function swap() {
    const node = ref.current;
    if (node === null) {
      running.current = false;
      return;
    }

    node.dataset.phase = "out";
    const fromW = node.offsetWidth;
    const fromH = node.offsetHeight;
    await animationsSettled(partAnimations(node));

    // Handover: release the hold, wait for the patch this triggers, then measure the natural size
    // of the new content.
    held.value = null;
    await nextFrame();

    node.style.width = "max-content";
    node.style.height = "max-content";
    const toW = node.offsetWidth;
    const toH = node.offsetHeight;
    node.style.width = "";
    node.style.height = "";

    // The flip runs at the duration and easing of the phase animation.
    let flip: Animation | undefined;
    node.dataset.phase = "in";
    const anims = partAnimations(node);
    const timing = anims[0]?.effect?.getComputedTiming();
    const duration =
      typeof timing?.duration === "number" && Number.isFinite(timing.duration)
        ? timing.duration
        : 0;
    if (duration > 0 && (toW !== fromW || toH !== fromH)) {
      // A JS animation eases the size so it does not conflict with the transitions on the element;
      // it ends at the measured natural size.
      flip = node.animate(
        [
          { width: `${fromW}px`, height: `${fromH}px` },
          { width: `${toW}px`, height: `${toH}px` },
        ],
        { duration, easing: timing?.easing ?? "ease-out" },
      );
    }

    await Promise.allSettled([flip?.finished, animationsSettled(anims)]);

    delete node.dataset.phase;
    running.current = false;
  }

  return {
    ref,
    // The caller's render brings the new content. Hold the old one through the out phase, and
    // refresh the target when the render runs mid-swap.
    render(content: ComponentChildren): ComponentChildren {
      if (on !== lastOn.current) {
        lastOn.current = on;
        if (!running.current && held.value === null) {
          held.value = shown.current;
        }
      }
      shown.current = content;
      return held.value ?? content;
    },
  };
}
