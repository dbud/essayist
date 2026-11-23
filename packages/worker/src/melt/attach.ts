import { acquireMeltContext } from "./context.ts";
import { findShapes, type ShapeNode } from "./discover.ts";
import { layoutFrame, type MeltFrame } from "./layout.ts";
import { createFrameLoop } from "./loop.ts";
import { measure, readShapeStyle, type ShapeStyle } from "./measure.ts";
import { readMotion, shapesAndAncestors, watchMotion } from "./motion.ts";
import { packFrame } from "./pack.ts";
import { timed } from "./stats.ts";

const LEFT_OUT = "data-melt-left-out";

/** Draws the melt of a group root on a canvas behind its content, and returns a function to stop.
    While the canvas draws, the root has the data-melt-drawn attribute, which turns off the
    backgrounds of the shapes in it. With debug, the canvas also outlines the measured box of each
    shape. A pixel ratio draws the canvas at that resolution instead of the one of the device. */
export function attachMelt(
  root: HTMLElement,
  {
    debug = false,
    fieldScale,
    pixelRatio,
  }: { debug?: boolean; fieldScale?: number; pixelRatio?: number } = {},
): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "melt-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const target = canvas.getContext("2d");
  if (target === null) return () => {};

  // Writes only on a change, as every attribute write wakes the loop through the observer below.
  const drawn = (on: boolean) => {
    canvas.hidden = !on;
    if (on === "meltDrawn" in root.dataset) return;
    if (on) root.dataset.meltDrawn = "";
    else delete root.dataset.meltDrawn;
  };
  const context = acquireMeltContext({
    lost: () => drawn(false),
    restored: () => restyle(),
  });
  if (context === null) return () => {};
  root.insertBefore(canvas, root.firstChild);

  let nodes: ShapeNode[] = [];
  const elements = () => nodes.map(({ element }) => element);
  // Shapes the canvas can't fit keep their own background. Writes only on a change, like drawn.
  const markLeftOut = (indexes: readonly number[]) => {
    const leftOut = new Set(indexes);
    nodes.forEach(({ element }, i) => {
      const out = leftOut.has(i);
      if (out !== element.hasAttribute(LEFT_OUT)) element.toggleAttribute(LEFT_OUT, out);
    });
  };
  // Styles are kept between the frames of a running animation. Anything that wakes the loop from
  // outside, such as a mutation, a hover or a resize, may restyle any shape, so it clears them.
  const styles = new Map<Element, ShapeStyle>();
  const restyle = () => {
    styles.clear();
    loop.wake();
  };
  const styleOf = (restyled: readonly Element[]) => (element: HTMLElement) => {
    const kept = styles.get(element);
    if (kept !== undefined && !restyled.some((animated) => animated.contains(element))) return kept;
    const style = readShapeStyle(element);
    styles.set(element, style);
    return style;
  };
  // The animations are read once at the start of each frame. Whether shapes still move then decides
  // whether to draw the next one; an animation that starts in between wakes the loop by its event.
  let withShapes = new Set<Element>();
  let moving = false;
  const loop = createFrameLoop(
    () => {
      const motionNow = timed("animations", () => readMotion(root, withShapes));
      moving = motionNow.moving;
      const measurement = measure(root, nodes, styleOf(motionNow.restyled));
      const frame = timed("layout", () => layoutFrame(measurement));
      markLeftOut(frame?.leftOut ?? []);
      if (frame === null) {
        canvas.hidden = true;
        return;
      }
      timed("draw", () => {
        const ratio = pixelRatio ?? devicePixelRatio;
        const packed = packFrame(frame, ratio, { debug, fieldScale });
        placeCanvas(canvas, frame, packed, ratio);
        drawn(context.render(packed, target));
      });
    },
    () => moving,
  );
  const motion = watchMotion(root, restyle);
  const discover = () => {
    nodes = findShapes(root);
    withShapes = shapesAndAncestors(root, elements());
    motion.track(elements());
  };
  discover();

  // An attribute can change how a shape looks. New elements or classes can add or remove shapes, so
  // they are found again. The canvas changes its own attributes on every draw.
  const mutations = new MutationObserver((records) => {
    const changes = records.filter((record) => record.target !== canvas);
    if (changes.length === 0) return;
    if (changes.some((record) => record.type === "childList" || record.attributeName === "class")) {
      discover();
    }
    restyle();
  });
  mutations.observe(root, { childList: true, attributes: true, subtree: true });
  // Attached before the first paint, so the group never shows unmelted.
  loop.drawNow();

  return () => {
    mutations.disconnect();
    motion.dispose();
    loop.dispose();
    markLeftOut([]);
    drawn(false);
    canvas.remove();
    context.release();
  };
}

// The CSS size follows the rounded pixel size, so the canvas is never scaled.
function placeCanvas(
  canvas: HTMLCanvasElement,
  frame: MeltFrame,
  size: { width: number; height: number },
  pixelRatio: number,
) {
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  canvas.style.left = `${frame.left}px`;
  canvas.style.top = `${frame.top}px`;
  canvas.style.width = `${size.width / pixelRatio}px`;
  canvas.style.height = `${size.height / pixelRatio}px`;
}
