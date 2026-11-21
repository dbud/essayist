import { acquireMeltContext } from "./context.ts";
import { type ShapeNode, watchShapes } from "./discover.ts";
import { layoutFrame, type MeltFrame } from "./layout.ts";
import { measure } from "./measure.ts";
import { packFrame } from "./pack.ts";
import { createFrameLoop, shapesMoving, watchMotion } from "./scheduler.ts";

/** Draws the melt of a group root on a canvas behind its content, and returns a function to stop.
    While the canvas draws, the root has the data-melt-drawn attribute, which turns off the
    backgrounds of the shapes in it. */
export function attachMelt(root: HTMLElement): () => void {
  const canvas = document.createElement("canvas");
  canvas.className = "melt-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const target = canvas.getContext("2d");
  if (target === null) return () => {};

  // Writes only on a change, as every attribute write wakes the loop through watchMotion.
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
      const packed = packFrame(frame, devicePixelRatio);
      placeCanvas(canvas, frame, packed, devicePixelRatio);
      drawn(context.render(packed, target));
    },
    () => shapesMoving(root, elements()),
  );
  const motion = watchMotion(root, canvas, loop.wake);
  const stopShapes = watchShapes(root, (found) => {
    nodes = found;
    motion.track(elements());
    loop.wake();
  });
  // Attached before the first paint, so the group never shows unmelted.
  loop.drawNow();

  return () => {
    stopShapes();
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
