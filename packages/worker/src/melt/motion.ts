export interface Motion {
  /** Whether an animation runs on a shape or on an element that contains one. Animations inside
      a shape, such as wave bars, don't move it. */
  readonly moving: boolean;
  /** The targets of running animations that change anything but opacity or a transform, so the
      shapes in them need their style read again. */
  readonly restyled: readonly Element[];
}

// The measurement reads opacity and the transformed rects on every frame, so animating these leaves
// the style of a shape as it was.
const GEOMETRY = new Set(["opacity", "transform", "translate", "scale", "rotate"]);
const KEYFRAME_FIELDS = new Set(["offset", "computedOffset", "easing", "composite"]);

// Whether an animation restyles doesn't change while it runs, and reading keyframes allocates, so
// it is worked out once per animation.
const restyles = new WeakMap<Animation, boolean>();

function restyling(animation: Animation, effect: KeyframeEffect): boolean {
  return restyles.getOrInsertComputed(animation, () => {
    const properties =
      animation instanceof CSSTransition
        ? [animation.transitionProperty]
        : effect
            .getKeyframes()
            .flatMap((frame) => Object.keys(frame))
            .filter((key) => !KEYFRAME_FIELDS.has(key));
    return properties.some((property) => !GEOMETRY.has(property));
  });
}

// TODO -- stop polling getAnimations, which costs about 6 ms a frame on a phone with 32 running
// animations: track CSS animations and transitions by their start and end events, and have
// useAqSwap report the animations it starts with element.animate, which fire no events.
/** Reads the running animations under the root once. withShapes holds the shapes and every
    element between them and the root, so an animation moves a shape when its target is in it. */
export function readMotion(root: HTMLElement, withShapes: ReadonlySet<Element>): Motion {
  let moving = false;
  const restyled: Element[] = [];
  for (const animation of root.getAnimations({ subtree: true })) {
    if (animation.playState !== "running") continue;
    const effect = animation.effect;
    if (!(effect instanceof KeyframeEffect) || effect.target === null) continue;
    if (withShapes.has(effect.target)) moving = true;
    if (restyling(animation, effect)) restyled.push(effect.target);
  }
  return { moving, restyled };
}

/** The shapes and every element between them and the root, for readMotion. */
export function shapesAndAncestors(root: HTMLElement, shapes: readonly Element[]): Set<Element> {
  const found = new Set<Element>();
  for (const shape of shapes) {
    for (let current: Element | null = shape; current !== null; current = current.parentElement) {
      if (found.has(current)) break;
      found.add(current);
      if (current === root) break;
    }
  }
  return found;
}

export interface MotionWatch {
  /** Watches the size of these shapes, in place of the ones before. */
  track(shapes: readonly Element[]): void;
  dispose(): void;
}

/** Calls wake when something may change how the shapes under the root look: a transition or an
    animation starts, the pointer or focus moves, a shape changes size, or an attribute of an
    ancestor changes, as when the theme switches or a panel around the root shows it again. */
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

  // Changes outside the root: the theme is set on the document element or follows the system, and a
  // panel shows or hides the root by its own class or style.
  const ancestors = new MutationObserver(wake);
  for (let node = root.parentElement; node !== null; node = node.parentElement) {
    ancestors.observe(node, { attributes: true });
  }
  const scheme = matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", wake);

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
      ancestors.disconnect();
      scheme.removeEventListener("change", wake);
    },
  };
}
