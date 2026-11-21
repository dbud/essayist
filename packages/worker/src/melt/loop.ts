export interface FrameLoop {
  /** Draws on the next frame, and on every frame after it while keepGoing returns true. */
  wake(): void;
  /** Draws now instead of on the next frame. */
  drawNow(): void;
  dispose(): void;
}

export function createFrameLoop(draw: () => void, keepGoing: () => boolean): FrameLoop {
  let request: number | null = null;

  function tick() {
    draw();
    request = keepGoing() ? requestAnimationFrame(tick) : null;
  }

  return {
    wake() {
      request ??= requestAnimationFrame(tick);
    },
    drawNow() {
      if (request !== null) cancelAnimationFrame(request);
      tick();
    },
    dispose() {
      if (request !== null) cancelAnimationFrame(request);
      request = null;
    },
  };
}
