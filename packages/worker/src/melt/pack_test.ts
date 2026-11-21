import { expect, test } from "vitest";

import { DEFAULT_SETTINGS, type MeltFrame, type MeltShape } from "./layout.ts";
import { MAX_SHAPES, packFrame } from "./pack.ts";

const shape = (group: number, x = 10): MeltShape => ({
  x,
  y: 20,
  halfWidth: 5,
  halfHeight: 4,
  radius: 2,
  color: [1, 0.5, 0, 1],
  group,
});

const frame = (shapes: MeltShape[]): MeltFrame => ({
  left: 0,
  top: 0,
  width: 100.4,
  height: 50,
  settings: DEFAULT_SETTINGS,
  shapes,
});

test("lengths are scaled to device pixels, and the size is rounded", () => {
  const packed = packFrame(frame([shape(0)]), 2);
  expect([packed.width, packed.height, packed.sigma]).toEqual([201, 100, 12]);
  expect(Array.from(packed.box.subarray(0, 4))).toEqual([20, 40, 10, 8]);
  expect(packed.radius[0]).toBe(4);
  expect(Array.from(packed.color.subarray(0, 4))).toEqual([1, 0.5, 0, 1]);
});

test("groups are numbered again from 0, and each ends after its last shape", () => {
  const packed = packFrame(frame([shape(0), shape(0), shape(3), shape(7)]), 1);
  expect(packed.groups).toBe(3);
  expect(Array.from(packed.groupEnd.subarray(0, 3))).toEqual([2, 3, 4]);
});

test("shapes past the limit are left out", () => {
  const many = frame(Array.from({ length: MAX_SHAPES + 3 }, (_, i) => shape(i, i)));
  const packed = packFrame(many, 1);
  expect(packed.groups).toBe(MAX_SHAPES);
  expect(packed.groupEnd[MAX_SHAPES - 1]).toBe(MAX_SHAPES);
});

test("a sigma of 0 stays above 0", () => {
  const packed = packFrame(
    { ...frame([shape(0)]), settings: { ...DEFAULT_SETTINGS, sigma: 0 } },
    1,
  );
  expect(packed.sigma).toBeGreaterThan(0);
});
