import { assertEquals } from "@std/assert";
import { test } from "vitest";
import type { MarkNumbers } from "#/signals/sidenotes.ts";
import { visibleBadgeNumbers } from "./markBadges.ts";

const numbers = (entries: [string, number][]): MarkNumbers => new Map(entries);

test("visibleBadgeNumbers -- contained mark keeps only the outer's end", () => {
  // "abc ^1 def ^1,2 ghi ^1" -- mark 1 spans all, mark 2 spans "def".
  const ordered = [
    { ids: ["1"], blockKey: "p" },
    { ids: ["1", "2"], blockKey: "p" },
    { ids: ["1"], blockKey: "p" },
  ];
  assertEquals(
    visibleBadgeNumbers(
      ordered,
      numbers([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[], [2], [1]],
  );
});

test("visibleBadgeNumbers -- multi-paragraph mark badges each block", () => {
  const ordered = [
    { ids: ["1"], blockKey: "p1" },
    { ids: ["1"], blockKey: "p2" },
  ];
  assertEquals(visibleBadgeNumbers(ordered, numbers([["1", 1]])), [[1], [1]]);
});

test("visibleBadgeNumbers -- partial overlap, a badge per mark at its end", () => {
  // "AAAAA{1} BBB{1,2} BB{2}" within a single paragraph.
  const ordered = [
    { ids: ["1"], blockKey: "p" },
    { ids: ["1", "2"], blockKey: "p" },
    { ids: ["2"], blockKey: "p" },
  ];
  assertEquals(
    visibleBadgeNumbers(
      ordered,
      numbers([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[], [1], [2]],
  );
});

test("visibleBadgeNumbers -- inner cut in first paragraph of a multi-paragraph mark", () => {
  // mark 1 spans two paragraphs; mark 2 cuts the first.
  const ordered = [
    { ids: ["1"], blockKey: "p1" },
    { ids: ["1", "2"], blockKey: "p1" },
    { ids: ["1"], blockKey: "p2" },
  ];
  assertEquals(
    visibleBadgeNumbers(
      ordered,
      numbers([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[], [1, 2], [1]],
  );
});

test("visibleBadgeNumbers -- single fragment keeps its number", () => {
  const ordered = [{ ids: ["1"], blockKey: "p" }];
  assertEquals(visibleBadgeNumbers(ordered, numbers([["1", 1]])), [[1]]);
});

test("visibleBadgeNumbers -- ids without an ordinal are dropped", () => {
  const ordered = [{ ids: ["x", "1"], blockKey: "p" }];
  assertEquals(visibleBadgeNumbers(ordered, numbers([["1", 1]])), [[1]]);
});

test("visibleBadgeNumbers -- adjacent marks in the same block keep both", () => {
  // "abc{1} def{2}" -- no overlap; each ends in the same block.
  const ordered = [
    { ids: ["1"], blockKey: "p" },
    { ids: ["2"], blockKey: "p" },
  ];
  assertEquals(
    visibleBadgeNumbers(
      ordered,
      numbers([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[1], [2]],
  );
});
