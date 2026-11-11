import { assertEquals } from "@std/assert";
import { test } from "vitest";

import type { MarkOrdinals } from "#/models/sidenotes.ts";

import { endingIds, ordinalsFor } from "./markBadges.ts";
import type { TrackedFragment } from "./sidenoteExtension.ts";

const ordinals = (entries: [string, number][]): MarkOrdinals => new Map(entries);

// endingIds reads only ids and badgeBlockKey, so fragments are stubbed without real DOM.
const frag = (ids: string[], badgeBlockKey: string): TrackedFragment => ({
  el: {} as HTMLElement,
  ids,
  top: 0,
  key: ids.at(0) ?? "",
  badgeBlockKey,
});

test("endingIds -- contained mark keeps only the outer's end", () => {
  // "abc ^1 def ^1,2 ghi ^1" -- mark 1 spans all, mark 2 spans "def".
  const fragments = [frag(["1"], "p"), frag(["1", "2"], "p"), frag(["1"], "p")];
  assertEquals(endingIds(fragments), [[], ["2"], ["1"]]);
});

test("endingIds -- multi-paragraph mark badges each block", () => {
  const fragments = [frag(["1"], "p1"), frag(["1"], "p2")];
  assertEquals(endingIds(fragments), [["1"], ["1"]]);
});

test("endingIds -- partial overlap, a badge per mark at its end", () => {
  // "AAAAA{1} BBB{1,2} BB{2}" within a single paragraph.
  const fragments = [frag(["1"], "p"), frag(["1", "2"], "p"), frag(["2"], "p")];
  assertEquals(endingIds(fragments), [[], ["1"], ["2"]]);
});

test("endingIds -- inner cut in first paragraph of a multi-paragraph mark", () => {
  // mark 1 spans two paragraphs; mark 2 cuts the first.
  const fragments = [frag(["1"], "p1"), frag(["1", "2"], "p1"), frag(["1"], "p2")];
  assertEquals(endingIds(fragments), [[], ["1", "2"], ["1"]]);
});

test("endingIds -- single fragment keeps its id", () => {
  const fragments = [frag(["1"], "p")];
  assertEquals(endingIds(fragments), [["1"]]);
});

test("endingIds -- adjacent marks in the same block keep both", () => {
  // "abc{1} def{2}" -- no overlap; each ends in the same block.
  const fragments = [frag(["1"], "p"), frag(["2"], "p")];
  assertEquals(endingIds(fragments), [["1"], ["2"]]);
});

test("ordinalsFor -- drops ids without an ordinal, ascending", () => {
  assertEquals(
    ordinalsFor(
      ["x", "2", "1"],
      ordinals([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [1, 2],
  );
});
