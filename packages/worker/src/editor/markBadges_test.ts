import { assertEquals } from "@std/assert";
import { test } from "vitest";

import type { MarkOrdinals } from "#/models/sidenotes.ts";

import { visibleBadgeOrdinals } from "./markBadges.ts";

const ordinals = (entries: [string, number][]): MarkOrdinals => new Map(entries);

test("visibleBadgeOrdinals -- contained mark keeps only the outer's end", () => {
  // "abc ^1 def ^1,2 ghi ^1" -- mark 1 spans all, mark 2 spans "def".
  const ordered = [
    { ids: ["1"], blockKey: "p" },
    { ids: ["1", "2"], blockKey: "p" },
    { ids: ["1"], blockKey: "p" },
  ];
  assertEquals(
    visibleBadgeOrdinals(
      ordered,
      ordinals([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[], [2], [1]],
  );
});

test("visibleBadgeOrdinals -- multi-paragraph mark badges each block", () => {
  const ordered = [
    { ids: ["1"], blockKey: "p1" },
    { ids: ["1"], blockKey: "p2" },
  ];
  assertEquals(visibleBadgeOrdinals(ordered, ordinals([["1", 1]])), [[1], [1]]);
});

test("visibleBadgeOrdinals -- partial overlap, a badge per mark at its end", () => {
  // "AAAAA{1} BBB{1,2} BB{2}" within a single paragraph.
  const ordered = [
    { ids: ["1"], blockKey: "p" },
    { ids: ["1", "2"], blockKey: "p" },
    { ids: ["2"], blockKey: "p" },
  ];
  assertEquals(
    visibleBadgeOrdinals(
      ordered,
      ordinals([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[], [1], [2]],
  );
});

test("visibleBadgeOrdinals -- inner cut in first paragraph of a multi-paragraph mark", () => {
  // mark 1 spans two paragraphs; mark 2 cuts the first.
  const ordered = [
    { ids: ["1"], blockKey: "p1" },
    { ids: ["1", "2"], blockKey: "p1" },
    { ids: ["1"], blockKey: "p2" },
  ];
  assertEquals(
    visibleBadgeOrdinals(
      ordered,
      ordinals([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[], [1, 2], [1]],
  );
});

test("visibleBadgeOrdinals -- single fragment keeps its ordinal", () => {
  const ordered = [{ ids: ["1"], blockKey: "p" }];
  assertEquals(visibleBadgeOrdinals(ordered, ordinals([["1", 1]])), [[1]]);
});

test("visibleBadgeOrdinals -- ids without an ordinal are dropped", () => {
  const ordered = [{ ids: ["x", "1"], blockKey: "p" }];
  assertEquals(visibleBadgeOrdinals(ordered, ordinals([["1", 1]])), [[1]]);
});

test("visibleBadgeOrdinals -- adjacent marks in the same block keep both", () => {
  // "abc{1} def{2}" -- no overlap; each ends in the same block.
  const ordered = [
    { ids: ["1"], blockKey: "p" },
    { ids: ["2"], blockKey: "p" },
  ];
  assertEquals(
    visibleBadgeOrdinals(
      ordered,
      ordinals([
        ["1", 1],
        ["2", 2],
      ]),
    ),
    [[1], [2]],
  );
});
