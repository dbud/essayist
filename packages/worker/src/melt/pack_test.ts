import { expect, test } from "vitest";

import { DEFAULT_SETTINGS, FIELD_REACH, type MeltFrame, type MeltShape } from "./layout.ts";
import { MAX_SHAPES, packFrame, reachOf, ROW, ROWS, texel } from "./pack.ts";

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
    height: 8,
  },
  cast: { x: 1, y: 8, blur: 6, key: 0.4, ambientBlur: 1, ambient: 0.5 },
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
  // The offsets, penumbra and reach of the shadows are lengths; how dark each is is not.
  expect(texel(packed, ROW.SHADOW_SHAPE, 0)).toEqual([2, 16, 12, 0.4].map(Math.fround));
  expect(texel(packed, ROW.SHADOW_AMBIENT, 0)).toEqual([2, 0.5, 0, 0]);
  // The radius and the stroke width are lengths; the glow is not.
  expect(texel(packed, ROW.SHAPE, 0).slice(0, 3)).toEqual([4, 2, 0.2].map(Math.fround));
});

test("the reach covers the field, or the offset and blurred shadow when it reaches further", () => {
  const sigma = 6;
  const plain = { ...shape(0), effects: { ...shape(0).effects, shadow: [0, 0, 0, 0] as const } };
  expect(reachOf(plain, sigma, 1)).toBe(FIELD_REACH * sigma);
  // An offset of 3, 4 is 5 long, and the key shadow reaches further than the ambient shadow.
  const shadowed = { ...shape(0), cast: { ...shape(0).cast, x: 3, y: 4, blur: 8 } };
  expect(reachOf(shadowed, sigma, 1)).toBeCloseTo(5 + FIELD_REACH * Math.hypot(sigma, 8));
  // Lengths are scaled to device pixels, but sigma already is.
  expect(reachOf(shadowed, sigma, 2)).toBeCloseTo(10 + FIELD_REACH * Math.hypot(sigma, 16));
});

test("the texture has a column per shape and a row per value", () => {
  const packed = packFrame(frame([shape(0), shape(1), shape(2)]), 1);
  expect(packed.count).toBe(3);
  expect(packed.shapes).toHaveLength(3 * ROWS * 4);
  expect(texel(packed, ROW.BOX, 2)[0]).toBe(10);
});

test("a group runs over the shapes that share it, wherever its number", () => {
  const packed = packFrame(frame([shape(0), shape(0), shape(3), shape(7)]), 1);
  expect(packed.groupList.map(({ start, end }) => [start, end])).toEqual([
    [0, 2],
    [2, 3],
    [3, 4],
  ]);
});

test("the area of a group covers its shapes and their reach, within the frame", () => {
  // Boxes of 10 by 8 round x 30 and x 60, at y 20: the reach is 3 sigma, or 18, and the top stops
  // at the frame.
  const plain = (x: number): MeltShape => ({
    ...shape(0, x),
    effects: { ...shape(0).effects, shadow: [0, 0, 0, 0] },
  });
  const [group] = packFrame(frame([plain(30), plain(60)]), 1).groupList;
  expect(group).toMatchObject({ left: 7, top: 0, right: 83, bottom: 42 });
});

test("shapes past the limit are left out", () => {
  const many = frame(Array.from({ length: MAX_SHAPES + 3 }, (_, i) => shape(i, i)));
  const packed = packFrame(many, 1);
  expect(packed.count).toBe(MAX_SHAPES);
  expect(packed.groupList).toHaveLength(MAX_SHAPES);
  expect(packed.groupList.at(-1)?.end).toBe(MAX_SHAPES);
});

test("a frame with no shapes still has a column", () => {
  const packed = packFrame(frame([]), 1);
  expect(packed.count).toBe(1);
  expect(packed.groupList).toHaveLength(0);
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
