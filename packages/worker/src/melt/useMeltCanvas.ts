import { useEffect, useRef } from "preact/hooks";

import { createMeltRenderer } from "./renderer.ts";
import { readFrame } from "./shapes.ts";

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

    // TODO -- draw only while something in the group moves
    let request = requestAnimationFrame(function tick() {
      const frame = readFrame(root);
      if (frame === null) {
        canvas.hidden = true;
      } else {
        canvas.hidden = false;
        canvas.style.left = `${frame.left}px`;
        canvas.style.top = `${frame.top}px`;
        canvas.style.width = `${frame.width}px`;
        canvas.style.height = `${frame.height}px`;
        renderer.draw(frame, devicePixelRatio);
      }
      request = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(request);
      delete root.dataset.meltDrawn;
      canvas.remove();
      renderer.dispose();
    };
  }, []);

  return ref;
}
