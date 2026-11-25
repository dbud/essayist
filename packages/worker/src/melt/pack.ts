import { FIELD_REACH, type MeltFrame, type MeltShape, MAX_SHAPES } from "./layout.ts";
import { FIELD_SCALE } from "./targets.ts";

export { MAX_SHAPES };
// Keeps the shader from dividing by zero when sigma is set to 0.
const MIN_SIGMA = 0.001;

/** The rows of the shape texture. Each shape is a column, with four numbers in each row. The
    shaders get these as ROW_BOX and so on. */
export const ROW = {
  /** The centre and half size. */
  BOX: 0,
  COLOR: 1,
  STROKE: 2,
  RIM: 3,
  SHADE: 4,
  SHADOW: 5,
  /** The offset in x and y and the half penumbra of the key shadow, and how dark it is. */
  SHADOW_SHAPE: 6,
  /** The corner radius, stroke width, glow, and reach, as reachOf. */
  SHAPE: 7,
  /** The reach of the ambient shadow and how dark it is, with the last two unused. */
  SHADOW_AMBIENT: 8,
} as const;

export const ROWS = Object.keys(ROW).length;

/** In device pixels. */
export interface PackedFrame {
  readonly width: number;
  readonly height: number;
  readonly sigma: number;
  readonly gain: number;
  readonly bias: number;
  /** Towards the light, with y pointing up. */
  readonly light: readonly [number, number];
  /** In radians above the page. */
  readonly lightElevation: number;
  /** In device pixels. */
  readonly rimWidth: number;
  readonly rimHighlight: number;
  readonly rimShine: number;
  readonly rimSheen: number;
  readonly grain: number;
  /** The shape texture, ROWS rows of count texels of four numbers. */
  readonly shapes: Float32Array;
  readonly count: number;
  /** The groups in drawing order. */
  readonly groupList: readonly PackedGroup[];
  /** Outlines the measured box of each shape over the melt. */
  readonly debug: boolean;
  /** The fraction of the canvas resolution the field passes of the multi-pass renderer draw at. */
  readonly fieldScale: number;
}

/** A group of a packed frame: its shapes, from start up to end, and the area they reach, in whole
    device pixels from the top left of the frame and within it. */
export interface PackedGroup {
  readonly start: number;
  readonly end: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The four numbers of a shape in a row of the shape texture. */
export function texel(frame: PackedFrame, row: number, column: number): number[] {
  const start = (row * frame.count + column) * 4;
  return Array.from(frame.shapes.subarray(start, start + 4));
}

/** How far from its box a shape draws anything, in device pixels: its field, or its key or ambient
    shadow, which are offset and blurred further. Past it, the shader skips the shape. */
export function reachOf(shape: MeltShape, sigma: number, pixelRatio: number): number {
  const field = FIELD_REACH * sigma;
  if (shape.effects.shadow[3] <= 0) return field;
  // As in field.frag: a shadow is never blurred under half a pixel, and the tight estimate blurs it
  // with sigma as well.
  const { cast } = shape;
  const reach = (x: number, y: number, blur: number) =>
    Math.hypot(x, y) * pixelRatio +
    FIELD_REACH * Math.hypot(sigma, Math.max(blur * pixelRatio, 0.5));
  return Math.max(field, reach(cast.x, cast.y, cast.blur), reach(0, 0, cast.ambientBlur));
}

/** Packs a frame for the shader. Shapes past the limit are left out. */
export function packFrame(
  frame: MeltFrame,
  pixelRatio: number,
  { debug = false, fieldScale = FIELD_SCALE }: { debug?: boolean; fieldScale?: number } = {},
): PackedFrame {
  const drawn = frame.shapes.slice(0, MAX_SHAPES);
  // At least one column, as a texture can't be empty.
  const count = Math.max(drawn.length, 1);
  const shapes = new Float32Array(ROWS * count * 4);
  const put = (row: number, column: number, values: readonly number[]) =>
    shapes.set(values, (row * count + column) * 4);
  const lengths = (values: readonly number[]) => values.map((value) => value * pixelRatio);
  const sigma = Math.max(frame.settings.sigma * pixelRatio, MIN_SIGMA);

  const width = Math.max(1, Math.round(frame.width * pixelRatio));
  const height = Math.max(1, Math.round(frame.height * pixelRatio));

  // The shapes come sorted by group, so a group starts where the group of a shape changes.
  const groupList: PackedGroup[] = [];
  drawn.forEach((shape, i) => {
    const starts = i === 0 || shape.group !== drawn[i - 1].group;
    const { effects } = shape;
    const reach = reachOf(shape, sigma, pixelRatio);
    const bounds = {
      left: Math.max(0, Math.floor((shape.x - shape.halfWidth) * pixelRatio - reach)),
      top: Math.max(0, Math.floor((shape.y - shape.halfHeight) * pixelRatio - reach)),
      right: Math.min(width, Math.ceil((shape.x + shape.halfWidth) * pixelRatio + reach)),
      bottom: Math.min(height, Math.ceil((shape.y + shape.halfHeight) * pixelRatio + reach)),
    };
    const last = groupList.at(-1);
    if (last === undefined || starts) {
      groupList.push({ start: i, end: i + 1, ...bounds });
    } else {
      groupList[groupList.length - 1] = {
        start: last.start,
        end: i + 1,
        left: Math.min(last.left, bounds.left),
        top: Math.min(last.top, bounds.top),
        right: Math.max(last.right, bounds.right),
        bottom: Math.max(last.bottom, bounds.bottom),
      };
    }
    put(ROW.BOX, i, lengths([shape.x, shape.y, shape.halfWidth, shape.halfHeight]));
    put(ROW.COLOR, i, shape.color);
    put(ROW.STROKE, i, effects.stroke);
    put(ROW.RIM, i, effects.rim);
    put(ROW.SHADE, i, effects.shade);
    put(ROW.SHADOW, i, effects.shadow);
    const { cast } = shape;
    put(ROW.SHADOW_SHAPE, i, [...lengths([cast.x, cast.y, cast.blur]), cast.key]);
    put(ROW.SHADOW_AMBIENT, i, [cast.ambientBlur * pixelRatio, cast.ambient, 0, 0]);
    put(ROW.SHAPE, i, [
      shape.radius * pixelRatio,
      effects.strokeWidth * pixelRatio,
      effects.glow,
      reach,
    ]);
  });

  return {
    width,
    height,
    sigma,
    gain: frame.settings.gain,
    bias: frame.settings.bias,
    light: [
      Math.sin((frame.settings.lightAngle * Math.PI) / 180),
      Math.cos((frame.settings.lightAngle * Math.PI) / 180),
    ],
    lightElevation: (frame.settings.lightElevation * Math.PI) / 180,
    rimWidth: frame.settings.rimWidth * pixelRatio,
    rimHighlight: frame.settings.rimHighlight,
    rimShine: frame.settings.rimShine,
    rimSheen: frame.settings.rimSheen,
    grain: frame.settings.grain,
    shapes,
    count,
    groupList,
    debug,
    fieldScale,
  };
}
