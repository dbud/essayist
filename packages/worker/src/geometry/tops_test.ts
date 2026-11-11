import { assertEquals } from "@std/assert";
import { test } from "vitest";

import type { Box } from "./span.ts";
import { stackTops } from "./tops.ts";

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

test("stackTops -- empty input", () => {
  assertEquals(stackTops([], 8), []);
});
