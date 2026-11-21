import type { MeltFrame } from "./layout.ts";

export const MAX_SHAPES = 32;
export const MAX_LAYERS = 4;
// Keeps the shader from dividing by zero when sigma is set to 0.
const MIN_SIGMA = 0.001;

/** In device pixels. */
export interface PackedFrame {
  readonly width: number;
  readonly height: number;
  readonly sigma: number;
  readonly gain: number;
  readonly bias: number;
  /** The centre and half size of each shape, four numbers per shape. */
  readonly box: Float32Array;
  readonly color: Float32Array;
  readonly radius: Float32Array;
  /** Layer n runs from layerEnd[n - 1], or 0 for the first layer, up to layerEnd[n]. */
  readonly layerEnd: Int32Array;
  readonly layers: number;
}

/** Packs a frame for the shader. Shapes past the limits are left out. */
export function packFrame(frame: MeltFrame, pixelRatio: number): PackedFrame {
  const box = new Float32Array(MAX_SHAPES * 4);
  const color = new Float32Array(MAX_SHAPES * 4);
  const radius = new Float32Array(MAX_SHAPES);
  const layerEnd = new Int32Array(MAX_LAYERS);

  const shapes = frame.shapes.filter((shape) => shape.layer < MAX_LAYERS).slice(0, MAX_SHAPES);
  let layers = 0;
  shapes.forEach((shape, i) => {
    box.set(
      [shape.x, shape.y, shape.halfWidth, shape.halfHeight].map((value) => value * pixelRatio),
      i * 4,
    );
    color.set(shape.color, i * 4);
    radius[i] = shape.radius * pixelRatio;
    layerEnd[shape.layer] = i + 1;
    layers = Math.max(layers, shape.layer + 1);
  });
  // A layer with no shapes ends where the layer before it ends.
  for (let layer = 1; layer < layers; layer++) {
    layerEnd[layer] = Math.max(layerEnd[layer], layerEnd[layer - 1]);
  }

  return {
    width: Math.max(1, Math.round(frame.width * pixelRatio)),
    height: Math.max(1, Math.round(frame.height * pixelRatio)),
    sigma: Math.max(frame.settings.sigma * pixelRatio, MIN_SIGMA),
    gain: frame.settings.gain,
    bias: frame.settings.bias,
    box,
    color,
    radius,
    layerEnd,
    layers,
  };
}
