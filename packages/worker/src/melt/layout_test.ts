import { expect, test } from "vitest";

import {
  DEFAULT_SETTINGS,
  layoutFrame,
  type MeasuredShape,
  type Measurement,
  resolveSettings,
} from "./layout.ts";

const BLACK = [0, 0, 0, 1] as const;
const NO_EFFECTS = { stroke: [0, 0, 0, 0], strokeWidth: 1, rim: [0, 0, 0, 0], glow: 0 } as const;

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

test("unset settings fall back to the defaults", () => {
  expect(resolveSettings({ sigma: Number.NaN, gain: 10, bias: Number.NaN })).toEqual({
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
  const effects = { stroke: [0, 0, 1, 1], strokeWidth: 2, rim: [1, 1, 1, 0.4], glow: 0.2 } as const;
  const frame = layoutFrame(measurement([shape({ fill: [1, 0, 0, 0.5], effects, opacity: 0.5 })]));
  expect(frame?.shapes[0].color).toEqual([1, 0, 0, 0.25]);
  expect(frame?.shapes[0].effects).toEqual({
    stroke: [0, 0, 1, 0.5],
    strokeWidth: 2,
    rim: [1, 1, 1, 0.2],
    glow: 0.1,
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
