/** Whether an animation or transition is running on a shape or on an element that contains a
    shape. Animations inside a shape, such as wave bars, don't move it. */
export function shapesMoving(root: HTMLElement, shapes: readonly Element[]): boolean {
  return root.getAnimations({ subtree: true }).some((animation) => {
    if (animation.playState !== "running") return false;
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    return target !== null && shapes.some((shape) => target.contains(shape));
  });
}

export interface MotionWatch {
  /** Watches the size of these shapes, in place of the ones before. */
  track(shapes: readonly Element[]): void;
  dispose(): void;
}

/** Calls wake when something under the root may change how its shapes look: a transition or an
    animation starts, the pointer or focus moves, or a shape changes size. */
export function watchMotion(root: HTMLElement, wake: () => void): MotionWatch {
  // Hover and focus change fills without a transition when motion is reduced.
  const events = [
    "transitionrun",
    "animationstart",
    "pointerover",
    "pointerout",
    "focusin",
    "focusout",
  ] as const;
  for (const type of events) root.addEventListener(type, wake);

  const sizes = new ResizeObserver(wake);
  sizes.observe(root);
  window.addEventListener("resize", wake);

  return {
    track(shapes) {
      sizes.disconnect();
      sizes.observe(root);
      for (const shape of shapes) sizes.observe(shape);
    },
    dispose() {
      for (const type of events) root.removeEventListener(type, wake);
      sizes.disconnect();
      window.removeEventListener("resize", wake);
    },
  };
}
