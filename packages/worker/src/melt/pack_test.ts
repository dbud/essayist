import { expect, test } from "vitest";

import { DEFAULT_SETTINGS, type MeltFrame, type MeltShape } from "./layout.ts";
import { MAX_LAYERS, MAX_SHAPES, packFrame } from "./pack.ts";

const shape = (layer: number, x = 10): MeltShape => ({
  x,
  y: 20,
  halfWidth: 5,
  halfHeight: 4,
  radius: 2,
  color: [1, 0.5, 0, 1],
  layer,
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

test("each layer ends where its last shape is, and an empty layer ends with the one before", () => {
  const packed = packFrame(frame([shape(0), shape(0), shape(2)]), 1);
  expect(packed.layers).toBe(3);
  expect(Array.from(packed.layerEnd.subarray(0, 3))).toEqual([2, 2, 3]);
});

test("shapes past the shape and layer limits are left out", () => {
  const deep = frame([
    shape(MAX_LAYERS),
    ...Array.from({ length: MAX_SHAPES + 3 }, (_, i) => shape(0, i)),
  ]);
  const packed = packFrame(deep, 1);
  expect(packed.layerEnd[0]).toBe(MAX_SHAPES);
  expect(packed.box[0]).toBe(0);
});

test("a sigma of 0 stays above 0", () => {
  const packed = packFrame(
    { ...frame([shape(0)]), settings: { ...DEFAULT_SETTINGS, sigma: 0 } },
    1,
  );
  expect(packed.sigma).toBeGreaterThan(0);
});
