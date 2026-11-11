import { assertEquals } from "@std/assert";
import { test } from "vitest";

import { markTops, type MarkFragment, type ZeroLengthMarkAnchor } from "./markGeometry.ts";

// The fold reads only the geometry fields, so fragment/anchor stubs skip real DOM.
const frag = (ids: string[], top: number): MarkFragment => ({
  el: {} as HTMLElement,
  ids,
  top,
  key: ids.at(0) ?? "",
  badgeBlockKey: "",
});
const anchor = (id: string, top: number): ZeroLengthMarkAnchor => ({
  id,
  key: "",
  top,
});

test("markTops -- a mark spanning several blocks takes the minimum top", () => {
  const fragments = [frag(["m1"], 100), frag(["m1", "m2"], 40), frag(["m2"], 180)];
  assertEquals(
    markTops(fragments, []),
    new Map([
      ["m1", 40],
      ["m2", 40],
    ]),
  );
});

test("markTops -- anchors fill only ids without a fragment", () => {
  const fragments = [frag(["m1"], 100)];
  const anchors = [anchor("m1", 3), anchor("m2", 60)];
  assertEquals(
    markTops(fragments, anchors),
    new Map([
      ["m1", 100],
      ["m2", 60],
    ]),
  );
});
