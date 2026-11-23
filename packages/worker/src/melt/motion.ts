/** Whether an animation or transition is running on a shape or on an element that contains a
    shape. Animations inside a shape, such as wave bars, don't move it. */
export function shapesMoving(root: HTMLElement, shapes: readonly Element[]): boolean {
  return root.getAnimations({ subtree: true }).some((animation) => {
    if (animation.playState !== "running") return false;
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    return target !== null && shapes.some((shape) => target.contains(shape));
  });
}

// The measurement reads opacity and the transformed rects on every frame, so animating these leaves
// the style of a shape as it was.
const GEOMETRY = new Set(["opacity", "transform", "translate", "scale", "rotate"]);
const KEYFRAME_FIELDS = new Set(["offset", "computedOffset", "easing", "composite"]);

/** The targets of running animations and transitions that change anything but opacity or a
    transform, so the shapes in them need their style read again. */
export function restyledElements(root: HTMLElement): Element[] {
  const targets: Element[] = [];
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation.playState !== "running") continue;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || effect.target === null) continue;
    const properties =
      animation instanceof CSSTransition
        ? [animation.transitionProperty]
        : effect
            .getKeyframes()
            .flatMap((frame) => Object.keys(frame))
            .filter((key) => !KEYFRAME_FIELDS.has(key));
    if (properties.some((property) => !GEOMETRY.has(property))) targets.push(effect.target);
  }
  return targets;
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
