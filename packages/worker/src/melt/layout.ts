import type { Rgba } from "./color.ts";

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MeltSettings {
  readonly sigma: number;
  readonly gain: number;
  readonly bias: number;
  /** In degrees clockwise from straight up. */
  readonly lightAngle: number;
  /** In degrees above the page. */
  readonly lightElevation: number;
  /** Half the thickness of the slab, the radius of its rounded edge, in CSS pixels. */
  readonly rimWidth: number;
  /** How bright the spot of the light is. */
  readonly rimHighlight: number;
  /** How small the spot of the light is. */
  readonly rimShine: number;
  /** How bright the broad glow round the light is. */
  readonly rimSheen: number;
}

export const DEFAULT_SETTINGS: MeltSettings = {
  sigma: 6,
  gain: 18,
  bias: -6,
  lightAngle: 0,
  lightElevation: 45,
  rimWidth: 4,
  rimHighlight: 1,
  rimShine: 12,
  rimSheen: 0.5,
};

/** The effects of a shape along the melted edge. */
export interface MeltEffects {
  /** A line just inside the edge. */
  readonly stroke: Rgba;
  /** In CSS pixels. */
  readonly strokeWidth: number;
  /** A band just inside the edge that fades inwards, strongest where the edge faces up. */
  readonly rim: Rgba;
  /** The same, strongest where the edge faces down, and a little wider. */
  readonly shade: Rgba;
  /** The opacity of a halo outside the edge, in the colour of the shapes nearby. */
  readonly glow: number;
  /** A shadow like the CSS drop-shadow, with lengths in CSS pixels. */
  readonly shadow: Rgba;
  readonly shadowX: number;
  readonly shadowY: number;
  readonly shadowBlur: number;
}

export interface MeasuredShape {
  /** In CSS pixels of the root, relative to its border box, with the transforms between the root
      and the shape applied. */
  readonly rect: Box;
  /** Without transforms, to tell how much the shape is scaled. */
  readonly layoutWidth: number;
  /** Without transforms. */
  readonly radius: number;
  readonly fill: Rgba;
  readonly effects: MeltEffects;
  /** Multiplied by the opacity of the ancestors. */
  readonly opacity: number;
  readonly visible: boolean;
  /** Shapes merge only with shapes of the same group. Groups are numbered in document order. */
  readonly group: number;
}

export interface Measurement {
  /** NaN where the root leaves a setting unset. */
  readonly settings: MeltSettings;
  readonly shapes: readonly MeasuredShape[];
}

/** In CSS pixels relative to the frame. */
export interface MeltShape {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly radius: number;
  /** With the opacity of the element and of its ancestors in the alpha. */
  readonly color: Rgba;
  /** With the same opacity in the alpha of the stroke, the rim and the glow. */
  readonly effects: MeltEffects;
  /** As in MeasuredShape. */
  readonly group: number;
}

/** In CSS pixels relative to the border box of the root. */
export interface MeltFrame extends Box {
  readonly settings: MeltSettings;
  /** Sorted by group, and in document order within a group. */
  readonly shapes: readonly MeltShape[];
  /** The indexes in the measurement of the visible shapes past MAX_SHAPES, which aren't drawn. */
  readonly leftOut: readonly number[];
}

/** The field of a shape is close to 0 more than this many sigma away from it. */
export const FIELD_REACH = 3;

/** The most shapes a frame draws. The shape texture has no practical limit, but every pixel loops
    over the shapes of the frame, so the cost grows with each one. */
export const MAX_SHAPES = 256;

export function resolveSettings(settings: MeltSettings): MeltSettings {
  const pick = (name: keyof MeltSettings) =>
    Number.isFinite(settings[name]) ? settings[name] : DEFAULT_SETTINGS[name];
  return {
    sigma: pick("sigma"),
    gain: pick("gain"),
    bias: pick("bias"),
    lightAngle: pick("lightAngle"),
    lightElevation: pick("lightElevation"),
    rimWidth: pick("rimWidth"),
    rimHighlight: pick("rimHighlight"),
    rimShine: pick("rimShine"),
    rimSheen: pick("rimSheen"),
  };
}

/** Lays out the visible shapes of a measurement, or returns null when there are none. */
export function layoutFrame(measurement: Measurement): MeltFrame | null {
  const settings = resolveSettings(measurement.settings);

  const visible = measurement.shapes
    .map((shape, index) => ({ shape, index }))
    .filter(
      ({ shape }) =>
        shape.visible &&
        shape.fill[3] * shape.opacity > 0 &&
        shape.rect.width > 0 &&
        shape.rect.height > 0,
    )
    .toSorted((a, b) => a.shape.group - b.shape.group);
  if (visible.length === 0) return null;
  const drawn = visible.slice(0, MAX_SHAPES).map(({ shape }) => shape);
  const leftOut = visible.slice(MAX_SHAPES).map(({ index }) => index);

  // The frame covers the field of each shape and its shadow, whichever reaches further. A blur of b
  // is a Gaussian of width b / 2, as in CSS.
  const margin = ({ effects }: MeasuredShape) =>
    Math.max(
      settings.sigma * FIELD_REACH,
      Math.max(Math.abs(effects.shadowX), Math.abs(effects.shadowY)) +
        (effects.shadowBlur / 2) * FIELD_REACH,
    );
  const left = Math.min(...drawn.map((shape) => shape.rect.left - margin(shape)));
  const top = Math.min(...drawn.map((shape) => shape.rect.top - margin(shape)));
  const right = Math.max(
    ...drawn.map((shape) => shape.rect.left + shape.rect.width + margin(shape)),
  );
  const bottom = Math.max(
    ...drawn.map((shape) => shape.rect.top + shape.rect.height + margin(shape)),
  );

  const shapes = drawn.map((shape): MeltShape => {
    const { rect, fill, effects, opacity } = shape;
    const scale = shape.layoutWidth > 0 ? rect.width / shape.layoutWidth : 1;
    return {
      x: rect.left + rect.width / 2 - left,
      y: rect.top + rect.height / 2 - top,
      halfWidth: rect.width / 2,
      halfHeight: rect.height / 2,
      radius: shape.radius * scale,
      color: [fill[0], fill[1], fill[2], fill[3] * opacity],
      effects: {
        stroke: [
          effects.stroke[0],
          effects.stroke[1],
          effects.stroke[2],
          effects.stroke[3] * opacity,
        ],
        strokeWidth: effects.strokeWidth,
        rim: [effects.rim[0], effects.rim[1], effects.rim[2], effects.rim[3] * opacity],
        shade: [effects.shade[0], effects.shade[1], effects.shade[2], effects.shade[3] * opacity],
        glow: effects.glow * opacity,
        shadow: [
          effects.shadow[0],
          effects.shadow[1],
          effects.shadow[2],
          effects.shadow[3] * opacity,
        ],
        shadowX: effects.shadowX,
        shadowY: effects.shadowY,
        shadowBlur: effects.shadowBlur,
      },
      group: shape.group,
    };
  });

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    settings,
    shapes,
    leftOut,
  };
}
