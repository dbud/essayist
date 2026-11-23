/** Milliseconds spent on melt frames across every root since the last take, for a readout. */
let measureMs = 0;
let drawMs = 0;
let gpuMs = 0;

/** Measuring covers reading the shapes and laying out the frame; drawing covers packing,
    rendering and copying into the canvas of the root. */
export function recordFrame(measure: number, draw: number): void {
  measureMs += measure;
  drawMs += draw;
}

/** The wait for the GPU to finish a frame, measured only while debugging. Part of drawing. */
export function recordGpu(ms: number): void {
  gpuMs += ms;
}

/** The totals since the last call, which start again from 0. */
export function takeFrameStats(): { measure: number; draw: number; gpu: number } {
  const stats = { measure: measureMs, draw: drawMs, gpu: gpuMs };
  measureMs = 0;
  drawMs = 0;
  gpuMs = 0;
  return stats;
}
