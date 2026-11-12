import { assertEquals } from "@std/assert";
import { test } from "vitest";

import { Layout, type Measured } from "./layout.ts";

const measured = (
  blocks: [string, number, number, number][],
  marks: [string, number, number][],
  sidenotes: [string, number][],
  blocksByMarkId: Record<string, string>,
): Measured => {
  const marksByBlock = new Map<string, { id: string; top: number; offset: number }[]>();
  for (const [id, top, offset] of marks) {
    const blockKey = blocksByMarkId[id];
    if (blockKey === undefined) continue;
    marksByBlock.getOrInsert(blockKey, []).push({ id, top, offset });
  }
  return {
    blocks: blocks.map(([key, top, height, margin]) => ({
      key,
      top,
      height,
      margin,
      marks: marksByBlock.get(key) ?? [],
    })),
    sidenotes: sidenotes.map(([id, height]) => ({ id, height })),
  };
};

const reflowed = (input: Measured): Layout => new Layout(input).normalize().reflow();

test("reflow -- pushes blocks so first marks meet their stacked notes", () => {
  const out = reflowed(
    measured(
      [
        ["p1", 0, 20, 0],
        ["p2", 32, 20, 0],
        ["p3", 400, 20, 0],
      ],
      [
        ["m1", 0, 0],
        ["m2", 32, 1],
        ["m3", 400, 2],
      ],
      [
        ["m1", 60],
        ["m2", 90],
        ["m3", 60],
      ],
      { m1: "p1", m2: "p2", m3: "p3" },
    ),
  );
  assertEquals(out.margins, new Map([["p2", 36]]));
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m2", 68],
      ["m3", 436],
    ]),
  );
});

test("reflow -- notes stack inside a block when its marks are close", () => {
  const out = reflowed(
    measured(
      [["p", 0, 100, 0]],
      [
        ["m1", 0, 0],
        ["m2", 30, 1],
      ],
      [
        ["m1", 60],
        ["m2", 10],
      ],
      { m1: "p", m2: "p" },
    ),
  );
  assertEquals(out.margins, new Map());
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m2", 68],
    ]),
  );
});

test("reflow -- inherited ceilings chain pushes to later blocks", () => {
  const out = reflowed(
    measured(
      [
        ["p1", 0, 20, 0],
        ["p2", 195, 10, 0],
        ["p3", 210, 10, 0],
      ],
      [
        ["m1", 0, 0],
        ["m2", 195, 1],
        ["m3", 210, 2],
      ],
      [
        ["m1", 200],
        ["m2", 10],
        ["m3", 10],
      ],
      { m1: "p1", m2: "p2", m3: "p3" },
    ),
  );
  assertEquals(
    out.margins,
    new Map([
      ["p2", 13],
      ["p3", 3],
    ]),
  );
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m2", 208],
      ["m3", 226],
    ]),
  );
});

test("reflow -- blocks without marks keep margin 0 and leave the cursor be", () => {
  const out = reflowed(
    measured(
      [
        ["p1", 0, 10, 0],
        ["p2", 30, 10, 0],
        ["p3", 60, 10, 0],
      ],
      [
        ["m1", 0, 0],
        ["m2", 60, 1],
      ],
      [
        ["m1", 10],
        ["m2", 10],
      ],
      { m1: "p1", m2: "p3" },
    ),
  );
  assertEquals(out.margins, new Map());
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m2", 60],
    ]),
  );
});

test("reflow -- marks without measured sidenotes are skipped", () => {
  const out = reflowed(
    measured(
      [["p", 0, 100, 0]],
      [
        ["m1", 0, 0],
        ["m2", 30, 1],
        ["m3", 62, 2],
      ],
      [
        ["m1", 60],
        ["m3", 10],
      ],
      { m1: "p", m2: "p", m3: "p" },
    ),
  );
  assertEquals(out.margins, new Map());
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m3", 68],
    ]),
  );
});

test("reflow -- reproduces its output from the settled state", () => {
  const first = reflowed(
    measured(
      [
        ["p1", 0, 20, 0],
        ["p2", 32, 20, 0],
        ["p3", 400, 20, 0],
      ],
      [
        ["m1", 0, 0],
        ["m2", 32, 1],
        ["m3", 400, 2],
      ],
      [
        ["m1", 60],
        ["m2", 60],
        ["m3", 60],
      ],
      { m1: "p1", m2: "p2", m3: "p3" },
    ),
  );
  // The applier wrote p2's margin: the next measurement sees the shifted tops and the written
  // margin as its input.
  const settled = reflowed(
    measured(
      [
        ["p1", 0, 20, 0],
        ["p2", 68, 20, 36],
        ["p3", 436, 20, 0],
      ],
      [
        ["m1", 0, 0],
        ["m2", 68, 1],
        ["m3", 436, 2],
      ],
      [
        ["m1", 60],
        ["m2", 60],
        ["m3", 60],
      ],
      { m1: "p1", m2: "p2", m3: "p3" },
    ),
  );
  assertEquals(settled.margins, first.margins);
  assertEquals(settled.sidenoteTops, first.sidenoteTops);
});

test("reflow -- unsorted blocks and marks order regardless of input order", () => {
  const out = reflowed(
    measured(
      [
        ["p3", 400, 20, 0],
        ["p1", 0, 20, 0],
        ["p2", 32, 20, 0],
      ],
      [
        ["m3", 400, 9],
        ["m1", 0, 3],
        ["m2", 32, 7],
      ],
      [
        ["m1", 60],
        ["m2", 90],
        ["m3", 60],
      ],
      { m1: "p1", m2: "p2", m3: "p3" },
    ),
  );
  assertEquals(out.margins, new Map([["p2", 36]]));
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m2", 68],
      ["m3", 436],
    ]),
  );
});

test("reflow -- unpaired marks are skipped", () => {
  const out = reflowed(
    measured(
      [["p", 0, 100, 0]],
      [
        ["m1", 0, 0],
        ["m2", 30, 1],
        ["m3", 62, 2],
      ],
      [
        ["m1", 60],
        ["m2", 10],
        ["m3", 10],
      ],
      { m1: "p", m3: "p" },
    ),
  );
  assertEquals(out.margins, new Map());
  assertEquals(
    out.sidenoteTops,
    new Map([
      ["m1", 0],
      ["m3", 68],
    ]),
  );
});
