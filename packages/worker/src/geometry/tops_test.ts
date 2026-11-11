import { assertEquals } from "@std/assert";
import { test } from "vitest";

import type { Box } from "./span.ts";
import { markTops, stackTops } from "./tops.ts";

const box = (top: number, height: number): Box => ({ top, height });

test("stackTops -- separated boxes keep their tops", () => {
  assertEquals(stackTops([box(0, 40), box(100, 40), box(300, 40)], 8), [0, 100, 300]);
});

test("stackTops -- overlapping boxes stack by gap", () => {
  assertEquals(stackTops([box(0, 40), box(10, 40)], 8), [0, 48]);
});

test("stackTops -- zero heights stack by gap alone", () => {
  assertEquals(stackTops([box(0, 0), box(4, 0), box(8, 0)], 8), [0, 8, 16]);
});

test("markTops -- a fragment spanning several blocks takes the minimum top", () => {
  const fragments = [
    { ids: ["m1"], top: 100 },
    { ids: ["m1", "m2"], top: 40 },
    { ids: ["m2"], top: 180 },
  ];
  assertEquals(
    markTops(fragments, []),
    new Map([
      ["m1", 40],
      ["m2", 40],
    ]),
  );
});

test("markTops -- anchors fill only ids without a fragment", () => {
  const fragments = [{ ids: ["m1"], top: 100 }];
  const anchors = [
    { id: "m1", top: 3 },
    { id: "m2", top: 60 },
  ];
  assertEquals(
    markTops(fragments, anchors),
    new Map([
      ["m1", 100],
      ["m2", 60],
    ]),
  );
});

test("stackTops -- empty input", () => {
  assertEquals(stackTops([], 8), []);
});
