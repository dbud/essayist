import { useEffect, useRef } from "preact/hooks";

import { type ShapeNode, watchShapes } from "./discover.ts";
import { layoutFrame, type MeltFrame } from "./layout.ts";
import { measure } from "./measure.ts";
import { packFrame } from "./pack.ts";
import { createMeltRenderer } from "./renderer.ts";
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
    const renderer = createMeltRenderer(canvas);
    if (renderer === null) return;
    root.insertBefore(canvas, root.firstChild);
    root.dataset.meltDrawn = "";

    let nodes: ShapeNode[] = [];
    const elements = () => nodes.map(({ element }) => element);
    const loop = createFrameLoop(
      () => {
        const frame = layoutFrame(measure(root, nodes));
        placeCanvas(canvas, frame);
        if (frame !== null) renderer.draw(packFrame(frame, devicePixelRatio));
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
      delete root.dataset.meltDrawn;
      canvas.remove();
      renderer.dispose();
    };
  }, []);

  return ref;
}

function placeCanvas(canvas: HTMLCanvasElement, frame: MeltFrame | null) {
  canvas.hidden = frame === null;
  if (frame === null) return;
  canvas.style.left = `${frame.left}px`;
  canvas.style.top = `${frame.top}px`;
  canvas.style.width = `${frame.width}px`;
  canvas.style.height = `${frame.height}px`;
}
