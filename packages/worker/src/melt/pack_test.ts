import { expect, test } from "vitest";

import { DEFAULT_SETTINGS, type MeltFrame, type MeltShape } from "./layout.ts";
import { MAX_SHAPES, packFrame, ROW, ROWS, texel } from "./pack.ts";

const shape = (group: number, x = 10): MeltShape => ({
  x,
  y: 20,
  halfWidth: 5,
  halfHeight: 4,
  radius: 2,
  color: [1, 0.5, 0, 1],
  effects: {
    stroke: [0, 0, 1, 0.5],
    strokeWidth: 1,
    rim: [1, 1, 1, 0.3],
    shade: [0, 0, 0, 0.2],
    glow: 0.2,
    shadow: [0, 0, 0, 0.2],
    shadowX: 1,
    shadowY: 8,
    shadowBlur: 12,
  },
  group,
});

const frame = (shapes: MeltShape[]): MeltFrame => ({
  left: 0,
  top: 0,
  width: 100.4,
  height: 50,
  settings: DEFAULT_SETTINGS,
  shapes,
  leftOut: [],
});

test("lengths are scaled to device pixels, and the size is rounded", () => {
  const packed = packFrame(frame([shape(0)]), 2);
  expect([packed.width, packed.height, packed.sigma]).toEqual([201, 100, 12]);
  expect(texel(packed, ROW.BOX, 0)).toEqual([20, 40, 10, 8]);
  expect(texel(packed, ROW.COLOR, 0)).toEqual([1, 0.5, 0, 1]);
  expect(texel(packed, ROW.STROKE, 0)).toEqual([0, 0, 1, 0.5]);
  expect(texel(packed, ROW.RIM, 0)).toEqual([1, 1, 1, 0.3].map(Math.fround));
  expect(texel(packed, ROW.SHADE, 0)).toEqual([0, 0, 0, 0.2].map(Math.fround));
  expect(texel(packed, ROW.SHADOW, 0)).toEqual([0, 0, 0, 0.2].map(Math.fround));
  // The shadow offset and Gaussian width, half the blur, are lengths.
  expect(texel(packed, ROW.SHADOW_SHAPE, 0).slice(0, 3)).toEqual([2, 16, 12]);
  // The radius and the stroke width are lengths; the glow is not.
  expect(texel(packed, ROW.SHAPE, 0).slice(0, 3)).toEqual([4, 2, 0.2].map(Math.fround));
});

test("the texture has a column per shape and a row per value", () => {
  const packed = packFrame(frame([shape(0), shape(1), shape(2)]), 1);
  expect(packed.count).toBe(3);
  expect(packed.shapes).toHaveLength(3 * ROWS * 4);
  expect(texel(packed, ROW.BOX, 2)[0]).toBe(10);
});

test("groups are numbered again from 0, and each ends after its last shape", () => {
  const packed = packFrame(frame([shape(0), shape(0), shape(3), shape(7)]), 1);
  expect(packed.groups).toBe(3);
  expect([0, 1, 2].map((g) => texel(packed, ROW.GROUPS, g)[0])).toEqual([2, 3, 4]);
});

test("shapes past the limit are left out", () => {
  const many = frame(Array.from({ length: MAX_SHAPES + 3 }, (_, i) => shape(i, i)));
  const packed = packFrame(many, 1);
  expect(packed.count).toBe(MAX_SHAPES);
  expect(packed.groups).toBe(MAX_SHAPES);
  expect(texel(packed, ROW.GROUPS, MAX_SHAPES - 1)[0]).toBe(MAX_SHAPES);
});

test("a frame with no shapes still has a column", () => {
  const packed = packFrame(frame([]), 1);
  expect([packed.count, packed.groups]).toEqual([1, 0]);
});

test("the light angle becomes a direction, from straight up and clockwise", () => {
  const lit = (lightAngle: number) =>
    packFrame({ ...frame([shape(0)]), settings: { ...DEFAULT_SETTINGS, lightAngle } }, 1).light;
  expect(lit(0)).toEqual([0, 1]);
  expect(lit(90)[0]).toBeCloseTo(1);
  expect(lit(90)[1]).toBeCloseTo(0);
});

test("a sigma of 0 stays above 0", () => {
  const packed = packFrame(
    { ...frame([shape(0)]), settings: { ...DEFAULT_SETTINGS, sigma: 0 } },
    1,
  );
  expect(packed.sigma).toBeGreaterThan(0);
});
