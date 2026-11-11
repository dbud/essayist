import { assertEquals } from "@std/assert";
import { test } from "vitest";

import type { MarkFragment, ZeroLengthMarkAnchor } from "#/editor/markGeometry.ts";

import type { Box } from "./span.ts";
import { markTops, stackTops } from "./tops.ts";

const box = (top: number, height: number): Box => ({ top, height });

// The fold reads only the geometry fields, so fragment/anchor stubs skip real DOM.
const frag = (ids: string[], top: number, marginBlockKey: string | null): MarkFragment => ({
  el: {} as HTMLElement,
  ids,
  top,
  key: ids.at(0) ?? "",
  badgeBlockKey: "",
  marginBlockKey,
});
const anchor = (id: string, top: number, marginBlockKey: string | null): ZeroLengthMarkAnchor => ({
  id,
  key: "",
  top,
  marginBlockKey,
});

test("stackTops -- separated boxes keep their tops", () => {
  assertEquals(stackTops([box(0, 40), box(100, 40), box(300, 40)], 8), [0, 100, 300]);
});

test("stackTops -- overlapping boxes stack by gap", () => {
  assertEquals(stackTops([box(0, 40), box(10, 40)], 8), [0, 48]);
});

test("stackTops -- zero heights stack by gap alone", () => {
  assertEquals(stackTops([box(0, 0), box(4, 0), box(8, 0)], 8), [0, 8, 16]);
});

test("markTops -- a mark spanning several blocks takes the minimum top with its first block", () => {
  const fragments = [
    frag(["m1"], 100, "p2"),
    frag(["m1", "m2"], 40, "p1"),
    frag(["m2"], 180, "p2"),
  ];
  assertEquals(
    markTops(fragments, []),
    new Map([
      ["m1", { top: 40, blockKey: "p1" }],
      ["m2", { top: 40, blockKey: "p1" }],
    ]),
  );
});

test("markTops -- anchors fill only ids without a fragment", () => {
  const fragments = [frag(["m1"], 100, "p1")];
  const anchors = [anchor("m1", 3, "p1"), anchor("m2", 60, "p3")];
  assertEquals(
    markTops(fragments, anchors),
    new Map([
      ["m1", { top: 100, blockKey: "p1" }],
      ["m2", { top: 60, blockKey: "p3" }],
    ]),
  );
});

test("stackTops -- empty input", () => {
  assertEquals(stackTops([], 8), []);
});
