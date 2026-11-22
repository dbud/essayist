import type { MeltFrame } from "./layout.ts";

export const MAX_SHAPES = 32;
// A group can hold a single shape, such as a menu row.
export const MAX_GROUPS = MAX_SHAPES;
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
  readonly stroke: Float32Array;
  readonly rim: Float32Array;
  readonly shade: Float32Array;
  readonly shadow: Float32Array;
  /** The shadow offset in x and y and its Gaussian width, four numbers per shape with the last
      unused. */
  readonly shadowShape: Float32Array;
  /** The corner radius, stroke width and glow of each shape, four numbers per shape with the last
      unused. */
  readonly shape: Float32Array;
  /** Group n runs from groupEnd[n - 1], or 0 for the first group, up to groupEnd[n]. */
  readonly groupEnd: Int32Array;
  readonly groups: number;
}

/** Packs a frame for the shader. Shapes past the limits are left out. */
export function packFrame(frame: MeltFrame, pixelRatio: number): PackedFrame {
  const box = new Float32Array(MAX_SHAPES * 4);
  const color = new Float32Array(MAX_SHAPES * 4);
  const stroke = new Float32Array(MAX_SHAPES * 4);
  const rim = new Float32Array(MAX_SHAPES * 4);
  const shade = new Float32Array(MAX_SHAPES * 4);
  const shadow = new Float32Array(MAX_SHAPES * 4);
  const shadowShape = new Float32Array(MAX_SHAPES * 4);
  const shapeData = new Float32Array(MAX_SHAPES * 4);
  const groupEnd = new Int32Array(MAX_GROUPS);

  // Groups are numbered again from 0, as the frame leaves out groups with nothing to draw.
  let groups = 0;
  let previous: number | null = null;
  frame.shapes.slice(0, MAX_SHAPES).forEach((shape, i) => {
    if (shape.group !== previous) groups++;
    previous = shape.group;
    box.set(
      [shape.x, shape.y, shape.halfWidth, shape.halfHeight].map((value) => value * pixelRatio),
      i * 4,
    );
    color.set(shape.color, i * 4);
    const { effects } = shape;
    stroke.set(effects.stroke, i * 4);
    rim.set(effects.rim, i * 4);
    shade.set(effects.shade, i * 4);
    shadow.set(effects.shadow, i * 4);
    shadowShape.set(
      [effects.shadowX, effects.shadowY, effects.shadowBlur / 2].map((value) => value * pixelRatio),
      i * 4,
    );
    shapeData.set(
      [shape.radius * pixelRatio, effects.strokeWidth * pixelRatio, effects.glow],
      i * 4,
    );
    groupEnd[groups - 1] = i + 1;
  });

  return {
    width: Math.max(1, Math.round(frame.width * pixelRatio)),
    height: Math.max(1, Math.round(frame.height * pixelRatio)),
    sigma: Math.max(frame.settings.sigma * pixelRatio, MIN_SIGMA),
    gain: frame.settings.gain,
    bias: frame.settings.bias,
    box,
    color,
    stroke,
    rim,
    shade,
    shadow,
    shadowShape,
    shape: shapeData,
    groupEnd,
    groups,
  };
}
