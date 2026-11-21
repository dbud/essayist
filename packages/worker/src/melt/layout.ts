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
}

export const DEFAULT_SETTINGS: MeltSettings = { sigma: 6, gain: 18, bias: -6 };

/** In viewport coordinates. */
export interface MeasuredShape {
  /** With transforms applied. */
  readonly rect: Box;
  /** Without transforms, to tell how much the shape is scaled. */
  readonly layoutWidth: number;
  /** Without transforms. */
  readonly radius: number;
  readonly fill: Rgba;
  /** Multiplied by the opacity of the ancestors. */
  readonly opacity: number;
  readonly visible: boolean;
  /** The index of the closest shape that contains this one, or -1. Parents come first. */
  readonly parent: number;
}

export interface Measurement {
  readonly root: Box;
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
  /** How many shapes contain this one. Shapes merge only with shapes on the same layer. */
  readonly layer: number;
}

/** In CSS pixels relative to the border box of the root. */
export interface MeltFrame extends Box {
  readonly settings: MeltSettings;
  /** Sorted by layer. */
  readonly shapes: readonly MeltShape[];
}

// The field of a shape fades out within three sigma.
const FIELD_SIGMAS = 3;

export function resolveSettings(settings: MeltSettings): MeltSettings {
  const pick = (name: keyof MeltSettings) =>
    Number.isFinite(settings[name]) ? settings[name] : DEFAULT_SETTINGS[name];
  return { sigma: pick("sigma"), gain: pick("gain"), bias: pick("bias") };
}

/** Lays out the visible shapes of a measurement, or returns null when there are none. */
export function layoutFrame(measurement: Measurement): MeltFrame | null {
  const settings = resolveSettings(measurement.settings);

  const layers: number[] = [];
  const drawn: { shape: MeasuredShape; layer: number }[] = [];
  measurement.shapes.forEach((shape, i) => {
    layers[i] = shape.parent === -1 ? 0 : layers[shape.parent] + 1;
    const alpha = shape.fill[3] * shape.opacity;
    if (shape.visible && alpha > 0 && shape.rect.width > 0 && shape.rect.height > 0) {
      drawn.push({ shape, layer: layers[i] });
    }
  });
  if (drawn.length === 0) return null;

  const margin = settings.sigma * FIELD_SIGMAS;
  const left = Math.min(...drawn.map(({ shape }) => shape.rect.left)) - margin;
  const top = Math.min(...drawn.map(({ shape }) => shape.rect.top)) - margin;
  const right = Math.max(...drawn.map(({ shape }) => shape.rect.left + shape.rect.width)) + margin;
  const bottom = Math.max(...drawn.map(({ shape }) => shape.rect.top + shape.rect.height)) + margin;

  const shapes = drawn
    .map(({ shape, layer }): MeltShape => {
      const { rect, fill } = shape;
      const scale = shape.layoutWidth > 0 ? rect.width / shape.layoutWidth : 1;
      return {
        x: rect.left + rect.width / 2 - left,
        y: rect.top + rect.height / 2 - top,
        halfWidth: rect.width / 2,
        halfHeight: rect.height / 2,
        radius: shape.radius * scale,
        color: [fill[0], fill[1], fill[2], fill[3] * shape.opacity],
        layer,
      };
    })
    .toSorted((a, b) => a.layer - b.layer);

  return {
    left: left - measurement.root.left,
    top: top - measurement.root.top,
    width: right - left,
    height: bottom - top,
    settings,
    shapes,
  };
}
