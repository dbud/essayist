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
  /** How wide the light is, as the angle from its centre to its edge, in degrees: a wider light
      casts a wider penumbra for the same height. */
  readonly lightSize: number;
  /** How much of the colour of a shape its shadow takes, from 0 to 1. */
  readonly shadowTint: number;
  /** The share of the light that comes from all around rather than from the light, from 0 to 1. */
  readonly lightAmbient: number;
  /** How strong the grain in the shadows is, as a share of how dark they are. */
  readonly grain: number;
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
  lightSize: 45,
  shadowTint: 0.25,
  lightAmbient: 0.6,
  grain: 0,
};

/** Where a shape casts its shadows on the page, in CSS pixels where y points down. How dark each
    is goes against the opacity of the shadow colour, from 0 to 1. */
export interface CastShadow {
  /** The offset of the key shadow, which the light casts away from itself. */
  readonly x: number;
  readonly y: number;
  /** Half the width of the penumbra of the key shadow. */
  readonly blur: number;
  readonly key: number;
  /** How far the ambient shadow reaches past the outline. The light from all around casts it as a
      crease along the outline, darkest at it. */
  readonly ambientBlur: number;
  readonly ambient: number;
}

// How far the ambient shadow of a shape on the page reaches past its outline, in CSS pixels. It
// reaches further by the height as the shape rises.
const AMBIENT_BLUR = 1;
// The lowest light, in degrees, so a light on the page doesn't cast an endless shadow.
const MIN_ELEVATION = 5;
// How dark the colour of a shape is in its shadow, from 0 to 1.
const TINT_DEPTH = 0.5;

/** The shadows a shape of a size, the smaller half of its width and height, casts from its height
    above the page. Most light comes from all around, so the ambient shadow stays under the shape,
    tight and dark on the page and wider as it rises; the rest comes from the light, whose key
    shadow falls away from it, further the lower it is, and blurs with the height and the size of
    the light. Both fade as the shape rises and blocks less of the light. */
export function castShadow(height: number, size: number, settings: MeltSettings): CastShadow {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lift = Math.max(height, 0);
  const angle = radians(settings.lightAngle);
  const length = lift / Math.tan(radians(Math.max(settings.lightElevation, MIN_ELEVATION)));
  const x = -Math.sin(angle) * length;
  const y = Math.cos(angle) * length;
  const span = Math.max(size, 1);
  const fade = (span * span) / (span * span + lift * lift);
  const ambient = Math.min(Math.max(settings.lightAmbient, 0), 1);
  const blur = lift * Math.tan(radians(Math.min(Math.max(settings.lightSize, 0), 89)));
  return {
    x,
    y,
    blur,
    key: (1 - ambient) * fade,
    // At least half the key penumbra, so the crease blends into it instead of ending inside it.
    ambientBlur: Math.max(AMBIENT_BLUR + lift, blur / 2),
    ambient: ambient * fade,
  };
}

/** The shadow colour, mixed with the darkened colour of the shape by the tint. */
export function tintShadow(shadow: Rgba, fill: Rgba, tint: number): Rgba {
  const mix = (from: number, to: number) => from + (to * TINT_DEPTH - from) * tint;
  return [mix(shadow[0], fill[0]), mix(shadow[1], fill[1]), mix(shadow[2], fill[2]), shadow[3]];
}

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
  /** The colour of the shadow, which castShadow places on the page from the height. */
  readonly shadow: Rgba;
  /** How high the shape floats above the page, in CSS pixels. */
  readonly height: number;
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
  /** With the same opacity in the alpha of the stroke, the rim and the glow, and the shadow
      tinted. */
  readonly effects: MeltEffects;
  readonly cast: CastShadow;
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
    lightSize: pick("lightSize"),
    shadowTint: pick("shadowTint"),
    lightAmbient: pick("lightAmbient"),
    grain: pick("grain"),
  };
}

/** The smaller half of the width and the height of a box. */
function sizeOf(box: Box): number {
  return Math.min(box.width, box.height) / 2;
}

/** How far past its box a shape draws, in CSS pixels: its field, or its key or ambient shadow. */
function marginOf({ effects, rect }: MeasuredShape, settings: MeltSettings): number {
  const field = settings.sigma * FIELD_REACH;
  if (effects.shadow[3] <= 0) return field;
  const cast = castShadow(effects.height, sizeOf(rect), settings);
  const key = Math.hypot(cast.x, cast.y) + FIELD_REACH * Math.hypot(settings.sigma, cast.blur);
  const ambient = FIELD_REACH * Math.hypot(settings.sigma, cast.ambientBlur);
  return Math.max(field, key, ambient);
}

/** Lays out the visible shapes of a measurement, or returns null when there are none. With a grid,
    in CSS pixels, the edges of the frame snap outwards to multiples of it. */
export function layoutFrame(measurement: Measurement, grid = 0): MeltFrame | null {
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

  const margin = (shape: MeasuredShape) => marginOf(shape, settings);
  const snap = (value: number, round: (value: number) => number) =>
    grid > 0 ? round(value / grid) * grid : value;
  const left = snap(Math.min(...drawn.map((shape) => shape.rect.left - margin(shape))), Math.floor);
  const top = snap(Math.min(...drawn.map((shape) => shape.rect.top - margin(shape))), Math.floor);
  const right = snap(
    Math.max(...drawn.map((shape) => shape.rect.left + shape.rect.width + margin(shape))),
    Math.ceil,
  );
  const bottom = snap(
    Math.max(...drawn.map((shape) => shape.rect.top + shape.rect.height + margin(shape))),
    Math.ceil,
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
        shadow: tintShadow(
          [effects.shadow[0], effects.shadow[1], effects.shadow[2], effects.shadow[3] * opacity],
          fill,
          settings.shadowTint,
        ),
        height: effects.height,
      },
      cast: castShadow(effects.height, sizeOf(rect), settings),
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
