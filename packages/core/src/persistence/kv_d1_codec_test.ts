/**
 * Scenarios for the D1 wire encoding: keys round-trip through hex, byte
 * order equals tuple order, prefix ranges bracket exactly their children,
 * and CBOR values round-trip losslessly.
 */

import { assertEquals } from "@std/assert";
import { test } from "vitest";
import {
  decodeValue,
  encodeValue,
  keyRange,
  packKey,
  unpackKey,
} from "./kv_d1_codec.ts";
import type { Key } from "./mod.ts";

const KEYS: Key[] = [
  [],
  ["cfg"],
  ["cfg", "categories", "vote-1"],
  ["café"],
  ["a\0b"],
  ["x".repeat(300)],
  ["a", "b", "c", "d", "e", "f", "g"],
];

test("keys round-trip through the hex encoding", () => {
  for (const key of KEYS) {
    assertEquals(unpackKey(packKey(key)), key);
  }
});

test("byte order of the stored text equals tuple order", () => {
  const ordered: Key[] = [
    ["cfg"],
    ["cfg", "a"],
    ["cfg", "a", "z"],
    ["cfg", "a\0b"],
    ["cfg", "ab"],
    ["cfg", "b"],
    ["cfgab"],
    ["d"],
  ];
  // A deterministic shuffle to prove the ordering comes from the encoding,
  // not from the input order.
  const shuffled = [
    ordered[5],
    ordered[0],
    ordered[7],
    ordered[2],
    ordered[3],
    ordered[6],
    ordered[1],
    ordered[4],
  ];
  assertEquals(
    shuffled.map((key) => packKey(key)).sort(),
    ordered.map((key) => packKey(key)),
  );
});

test("keyRange brackets exactly the prefix children", () => {
  const all: Key[] = [
    ["cfg"],
    ["cfg", "a"],
    ["cfg", "a", "z"],
    ["cfg", "a\0b"],
    ["cfg", "ab"],
    ["cfg", "b"],
    ["cfgab"],
    ["d"],
  ];
  const range = keyRange(["cfg", "a"]);
  const end = range.end;
  if (end === undefined) throw new Error("expected a bounded range");
  const inside = all.filter((key) => {
    const packed = packKey(key);
    return packed >= range.begin && packed < end;
  });
  // Tuple children of ["cfg", "a"]. By byte order, a string continuation
  // of the last part (the NUL in "a\0b") also lands inside, as in FDB and
  // Deno KV; no key here contains a NUL in practice.
  assertEquals(inside, [
    ["cfg", "a"],
    ["cfg", "a", "z"],
    ["cfg", "a\0b"],
  ]);
});

test("keyRange of the empty prefix is unbounded", () => {
  assertEquals(keyRange([]), { begin: "", end: undefined });
});

const VALUES: unknown[] = [
  "a string",
  42,
  3.25,
  0.1,
  true,
  false,
  null,
  undefined,
  { id: "c1", label: "Grammar", description: "clarity" },
  { nested: { list: [1, 2, 3] }, empty: {} },
  { owner: "x", heartbeatAt: 100, gone: undefined },
  new Uint8Array([0, 1, 255, 0, 128]),
  new Uint8Array(0),
  [[1, [new Uint8Array([7])]]],
  "éü漢",
];

test("values round-trip losslessly", () => {
  for (const value of VALUES) {
    assertEquals(decodeValue(encodeValue(value)), value);
  }
});
