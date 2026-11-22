import { acquireMeltContext } from "./context.ts";
import { findShapes, type ShapeNode } from "./discover.ts";
import { layoutFrame, type MeltFrame } from "./layout.ts";
import { createFrameLoop } from "./loop.ts";
import { measure } from "./measure.ts";
import { shapesMoving, watchMotion } from "./motion.ts";
import { packFrame } from "./pack.ts";

/** Draws the melt of a group root on a canvas behind its content, and returns a function to stop.
    While the canvas draws, the root has the data-melt-drawn attribute, which turns off the
    backgrounds of the shapes in it. With debug, the canvas also outlines the measured box of each
    shape. */
export function attachMelt(root: HTMLElement, { debug = false } = {}): () => void {
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
    restored: () => loop.wake(),
  });
  if (context === null) return () => {};
  root.insertBefore(canvas, root.firstChild);

  let nodes: ShapeNode[] = [];
  const elements = () => nodes.map(({ element }) => element);
  const loop = createFrameLoop(
    () => {
      const frame = layoutFrame(measure(root, nodes));
      if (frame === null) {
        canvas.hidden = true;
        return;
      }
      const packed = packFrame(frame, devicePixelRatio, debug);
      placeCanvas(canvas, frame, packed, devicePixelRatio);
      drawn(context.render(packed, target));
    },
    () => shapesMoving(root, elements()),
  );
  const motion = watchMotion(root, loop.wake);
  const discover = () => {
    nodes = findShapes(root);
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
    loop.wake();
  });
  mutations.observe(root, { childList: true, attributes: true, subtree: true });
  // Attached before the first paint, so the group never shows unmelted.
  loop.drawNow();

  return () => {
    mutations.disconnect();
    motion.dispose();
    loop.dispose();
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
