import { useEffect, useRef } from "preact/hooks";

import { acquireMeltContext } from "./context.ts";
import { type ShapeNode, watchShapes } from "./discover.ts";
import { layoutFrame, type MeltFrame } from "./layout.ts";
import { measure } from "./measure.ts";
import { packFrame } from "./pack.ts";
import { createFrameLoop, shapesMoving, watchMotion } from "./scheduler.ts";

/** Draws the melt of a group root on a canvas behind its content. While the canvas draws, the
    root has the data-melt-drawn attribute, which turns off the SVG filter and the backgrounds of
    the shapes in it. */
export function useMeltCanvas<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;
    const canvas = document.createElement("canvas");
    canvas.className = "melt-canvas";
    canvas.setAttribute("aria-hidden", "true");
    const target = canvas.getContext("2d");
    if (target === null) return;

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
    if (context === null) return;
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
        placeCanvas(canvas, frame, packed);
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

    return () => {
      stopShapes();
      motion.dispose();
      loop.dispose();
      drawn(false);
      canvas.remove();
      context.release();
    };
  }, []);

  return ref;
}

function placeCanvas(
  canvas: HTMLCanvasElement,
  frame: MeltFrame,
  size: { width: number; height: number },
) {
  if (canvas.width !== size.width) canvas.width = size.width;
  if (canvas.height !== size.height) canvas.height = size.height;
  canvas.style.left = `${frame.left}px`;
  canvas.style.top = `${frame.top}px`;
  canvas.style.width = `${frame.width}px`;
  canvas.style.height = `${frame.height}px`;
}
