import { expect, test } from "vitest";

import {
  castShadow,
  DEFAULT_SETTINGS,
  FIELD_REACH,
  layoutFrame,
  MAX_SHAPES,
  type MeasuredShape,
  type Measurement,
  resolveSettings,
} from "./layout.ts";

const BLACK = [0, 0, 0, 1] as const;
const NO_EFFECTS = {
  stroke: [0, 0, 0, 0],
  strokeWidth: 1,
  rim: [0, 0, 0, 0],
  shade: [0, 0, 0, 0],
  glow: 0,
  shadow: [0, 0, 0, 0],
  height: 0,
} as const;

const shape = (fields: Partial<MeasuredShape> = {}): MeasuredShape => ({
  rect: { left: 100, top: 100, width: 40, height: 20 },
  layoutWidth: 40,
  radius: 4,
  fill: BLACK,
  effects: NO_EFFECTS,
  opacity: 1,
  visible: true,
  group: 0,
  ...fields,
});

const measurement = (shapes: MeasuredShape[], sigma = 5): Measurement => ({
  settings: { ...DEFAULT_SETTINGS, sigma },
  shapes,
});

test("shapes past the limit are left out of the frame and its bounds", () => {
  const row = (i: number) =>
    shape({ rect: { left: i * 50, top: 0, width: 40, height: 20 }, group: i });
  const frame = layoutFrame(measurement(Array.from({ length: MAX_SHAPES + 2 }, (_, i) => row(i))));
  expect(frame?.shapes).toHaveLength(MAX_SHAPES);
  expect(frame?.leftOut).toEqual([MAX_SHAPES, MAX_SHAPES + 1]);
  // The last drawn shape ends at x = 31 * 50 + 40; the margin is 15.
  expect(frame?.width).toBe((MAX_SHAPES - 1) * 50 + 40 + 2 * 15);
});

test("unset settings fall back to the defaults", () => {
  const unset = {
    sigma: Number.NaN,
    gain: 10,
    bias: Number.NaN,
    lightAngle: Number.NaN,
    lightElevation: Number.NaN,
    rimWidth: Number.NaN,
    rimHighlight: Number.NaN,
    rimShine: Number.NaN,
    rimSheen: Number.NaN,
    lightSize: Number.NaN,
    shadowTint: Number.NaN,
    lightAmbient: Number.NaN,
    grain: Number.NaN,
  };
  expect(resolveSettings(unset)).toEqual({
    ...DEFAULT_SETTINGS,
    gain: 10,
  });
});

test("the frame spans the shapes and three sigma around them", () => {
  const frame = layoutFrame(
    measurement([
      shape(),
      shape({ rect: { left: 150, top: 110, width: 30, height: 30 }, layoutWidth: 30 }),
    ]),
  );
  // Shapes span x 100..180 and y 100..140; the margin is 15.
  expect(frame).toMatchObject({ left: 85, top: 85, width: 110, height: 70 });
  expect(frame?.shapes[0]).toMatchObject({ x: 35, y: 25, halfWidth: 20, halfHeight: 10 });
});

test("the frame reaches past a shape for its shadow", () => {
  const effects = { ...NO_EFFECTS, shadow: [0, 0, 0, 0.3], height: 8 } as const;
  // With the light at 45deg, straight up and 45deg wide, the key shadow falls 8 down with a blur of
  // 8, which the tight estimate widens by sigma. It reaches further than the ambient shadow.
  const margin = 8 + FIELD_REACH * Math.hypot(5, 8);
  const frame = layoutFrame(measurement([shape({ effects })]));
  expect(frame?.left).toBeCloseTo(100 - margin);
  expect(frame?.top).toBeCloseTo(100 - margin);
  expect(frame?.width).toBeCloseTo(40 + 2 * margin);
  expect(frame?.height).toBeCloseTo(20 + 2 * margin);
});

test("the key shadow falls away from the light, further and softer the higher the shape", () => {
  const settings = { ...DEFAULT_SETTINGS, lightAngle: -90, lightElevation: 45, lightSize: 45 };
  // The light is to the left, so the key shadow falls to the right.
  const low = castShadow(2, 10, settings);
  expect(low.x).toBeCloseTo(2);
  expect(low.y).toBeCloseTo(0);
  expect(low.blur).toBeCloseTo(2);
  const high = castShadow(8, 10, settings);
  expect(high.x).toBeCloseTo(8);
  expect(high.blur).toBeCloseTo(8);
});

test("the ambient shadow stays under the shape, and both fade as it rises", () => {
  const settings = { ...DEFAULT_SETTINGS, lightAmbient: 0.6 };
  const flat = castShadow(0, 10, settings);
  // On the page, the light is split between the shadows, and the ambient one is tight.
  expect(flat.ambient).toBeCloseTo(0.6);
  expect(flat.key).toBeCloseTo(0.4);
  expect(flat.ambientBlur).toBe(1);
  // Risen as high as the shape is wide, each is half as dark, and the ambient one is wider.
  const risen = castShadow(10, 10, settings);
  expect(risen.ambient).toBeCloseTo(0.3);
  expect(risen.key).toBeCloseTo(0.2);
  expect(risen.ambientBlur).toBe(11);
});

test("the ambient shadow reaches at least half as far as the penumbra of the key shadow", () => {
  const cast = castShadow(4, 10, { ...DEFAULT_SETTINGS, lightSize: 80 });
  expect(cast.ambientBlur).toBeCloseTo(cast.blur / 2);
});

test("a lower light casts a longer shadow", () => {
  const at = (lightElevation: number) =>
    castShadow(4, 10, { ...DEFAULT_SETTINGS, lightAngle: 0, lightElevation }).y;
  expect(at(20)).toBeGreaterThan(at(45));
  expect(at(45)).toBeCloseTo(4);
});

test("a shape scaled by a transform has its radius scaled too", () => {
  const scaled = shape({ rect: { left: 100, top: 100, width: 20, height: 10 }, radius: 8 });
  expect(layoutFrame(measurement([scaled]))?.shapes[0].radius).toBe(4);
});

test("shapes are sorted by group and keep their document order within it", () => {
  const frame = layoutFrame(
    measurement([
      shape({ group: 0, radius: 1 }),
      shape({ group: 1, radius: 2 }),
      shape({ group: 0, radius: 3 }),
    ]),
  );
  expect(frame?.shapes.map(({ group, radius }) => [group, radius])).toEqual([
    [0, 1],
    [0, 3],
    [1, 2],
  ]);
});

test("the opacity of a shape goes into the alpha of its colour and of its effects", () => {
  const effects = {
    ...NO_EFFECTS,
    stroke: [0, 0, 1, 1],
    strokeWidth: 2,
    rim: [1, 1, 1, 0.4],
    glow: 0.2,
    shadow: [0, 0, 0, 0.6],
  } as const;
  const frame = layoutFrame(measurement([shape({ fill: [1, 0, 0, 0.5], effects, opacity: 0.5 })]));
  expect(frame?.shapes[0].color).toEqual([1, 0, 0, 0.25]);
  expect(frame?.shapes[0].effects).toEqual({
    stroke: [0, 0, 1, 0.5],
    strokeWidth: 2,
    rim: [1, 1, 1, 0.2],
    shade: [0, 0, 0, 0],
    glow: 0.1,
    // The default tint mixes in a quarter of the darkened red.
    shadow: [0.125, 0, 0, 0.3],
    height: 0,
  });
});

test("hidden, transparent and empty shapes are left out", () => {
  const frame = layoutFrame(
    measurement([
      shape({ visible: false }),
      shape({ group: 1 }),
      shape({ fill: [0, 0, 0, 0] }),
      shape({ opacity: 0 }),
      shape({ rect: { left: 0, top: 0, width: 0, height: 10 } }),
    ]),
  );
  expect(frame?.shapes.map(({ group }) => group)).toEqual([1]);
});

test("a frame with nothing to draw is null", () => {
  expect(layoutFrame(measurement([shape({ visible: false })]))).toBeNull();
});

test("a grid snaps the edges of the frame outwards and keeps the shapes in place", () => {
  // The field of sigma 5 reaches 15 past the box at 100 to 140 by 100 to 120.
  const frame = layoutFrame(measurement([shape()], 5), 8);
  expect(frame).toMatchObject({ left: 80, top: 80, width: 80, height: 56 });
  expect(frame?.shapes[0]).toMatchObject({ x: 40, y: 30 });
});
