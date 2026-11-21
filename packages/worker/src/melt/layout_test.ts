import { expect, test } from "vitest";

import {
  DEFAULT_SETTINGS,
  layoutFrame,
  type MeasuredShape,
  type Measurement,
  resolveSettings,
} from "./layout.ts";

const BLACK = [0, 0, 0, 1] as const;

const shape = (fields: Partial<MeasuredShape> = {}): MeasuredShape => ({
  rect: { left: 100, top: 100, width: 40, height: 20 },
  layoutWidth: 40,
  radius: 4,
  fill: BLACK,
  opacity: 1,
  visible: true,
  parent: -1,
  ...fields,
});

const measurement = (shapes: MeasuredShape[], sigma = 5): Measurement => ({
  root: { left: 90, top: 80, width: 200, height: 50 },
  settings: { sigma, gain: 18, bias: -6 },
  shapes,
});

test("unset settings fall back to the defaults", () => {
  expect(resolveSettings({ sigma: Number.NaN, gain: 10, bias: Number.NaN })).toEqual({
    ...DEFAULT_SETTINGS,
    gain: 10,
  });
});

test("the frame spans the shapes and three sigma around them, relative to the root", () => {
  const frame = layoutFrame(
    measurement([
      shape(),
      shape({ rect: { left: 150, top: 110, width: 30, height: 30 }, layoutWidth: 30 }),
    ]),
  );
  // Shapes span x 100..180 and y 100..140; the margin is 15.
  expect(frame).toMatchObject({ left: -5, top: 5, width: 110, height: 70 });
  expect(frame?.shapes[0]).toMatchObject({ x: 35, y: 25, halfWidth: 20, halfHeight: 10 });
});

test("a shape scaled by a transform has its radius scaled too", () => {
  const scaled = shape({ rect: { left: 100, top: 100, width: 20, height: 10 }, radius: 8 });
  expect(layoutFrame(measurement([scaled]))?.shapes[0].radius).toBe(4);
});

test("layers count the shapes that contain a shape, and the frame is sorted by them", () => {
  const frame = layoutFrame(
    measurement([shape(), shape({ parent: 0 }), shape({ parent: 1 }), shape()]),
  );
  expect(frame?.shapes.map(({ layer }) => layer)).toEqual([0, 0, 1, 2]);
});

test("the opacity of a shape goes into the alpha of its colour", () => {
  const frame = layoutFrame(measurement([shape({ fill: [1, 0, 0, 0.5], opacity: 0.5 })]));
  expect(frame?.shapes[0].color).toEqual([1, 0, 0, 0.25]);
});

test("hidden, transparent and empty shapes are left out, and their children keep their layer", () => {
  const frame = layoutFrame(
    measurement([
      shape({ visible: false }),
      shape({ parent: 0 }),
      shape({ fill: [0, 0, 0, 0] }),
      shape({ opacity: 0 }),
      shape({ rect: { left: 0, top: 0, width: 0, height: 10 } }),
    ]),
  );
  expect(frame?.shapes.map(({ layer }) => layer)).toEqual([1]);
});

test("a frame with nothing to draw is null", () => {
  expect(layoutFrame(measurement([shape({ visible: false })]))).toBeNull();
});
