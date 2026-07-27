import { assertEquals } from "@std/assert";
import { segmentMarks } from "./markSegments.ts";

Deno.test("segmentMarks -- empty input", () => {
  assertEquals(segmentMarks([]), []);
});

Deno.test("segmentMarks -- zero-length spans are dropped", () => {
  assertEquals(segmentMarks([{ offset: 5, length: 0, thread_id: "z" }]), []);
});

Deno.test("segmentMarks -- single mark yields one segment", () => {
  assertEquals(segmentMarks([{ offset: 3, length: 4, thread_id: "a" }]), [
    { offset: 3, length: 4, ids: ["a"] },
  ]);
});

Deno.test("segmentMarks -- two non-overlapping marks keep a gap", () => {
  const segs = segmentMarks([
    { offset: 0, length: 3, thread_id: "a" },
    { offset: 5, length: 2, thread_id: "b" },
  ]);
  assertEquals(segs, [
    { offset: 0, length: 3, ids: ["a"] },
    { offset: 5, length: 2, ids: ["b"] },
  ]);
});

Deno.test("segmentMarks -- adjacent marks (touching, no overlap) stay separate", () => {
  const segs = segmentMarks([
    { offset: 0, length: 3, thread_id: "a" },
    { offset: 3, length: 2, thread_id: "b" },
  ]);
  assertEquals(segs, [
    { offset: 0, length: 3, ids: ["a"] },
    { offset: 3, length: 2, ids: ["b"] },
  ]);
});

Deno.test("segmentMarks -- partial overlap splits into three segments", () => {
  // a: [0,5), b: [3,8) -> overlap [3,5)
  const segs = segmentMarks([
    { offset: 0, length: 5, thread_id: "a" },
    { offset: 3, length: 5, thread_id: "b" },
  ]);
  assertEquals(segs, [
    { offset: 0, length: 3, ids: ["a"] },
    { offset: 3, length: 2, ids: ["a", "b"] },
    { offset: 5, length: 3, ids: ["b"] },
  ]);
});

Deno.test("segmentMarks -- fully nested mark: outer first in id order", () => {
  // outer: [0,10), inner: [3,6)
  const segs = segmentMarks([
    { offset: 0, length: 10, thread_id: "outer" },
    { offset: 3, length: 3, thread_id: "inner" },
  ]);
  assertEquals(segs, [
    { offset: 0, length: 3, ids: ["outer"] },
    { offset: 3, length: 3, ids: ["outer", "inner"] },
    { offset: 6, length: 4, ids: ["outer"] },
  ]);
});

Deno.test("segmentMarks -- outer listed first regardless of input order", () => {
  const segs = segmentMarks([
    { offset: 3, length: 3, thread_id: "inner" },
    { offset: 0, length: 10, thread_id: "outer" },
  ]);
  assertEquals(segs[1].ids, ["outer", "inner"]);
});

Deno.test("segmentMarks -- two inner marks side by side under one outer", () => {
  // outer: [0,12), innerA: [2,5), innerB: [7,10)
  const segs = segmentMarks([
    { offset: 0, length: 12, thread_id: "outer" },
    { offset: 2, length: 3, thread_id: "a" },
    { offset: 7, length: 3, thread_id: "b" },
  ]);
  assertEquals(segs, [
    { offset: 0, length: 2, ids: ["outer"] },
    { offset: 2, length: 3, ids: ["outer", "a"] },
    { offset: 5, length: 2, ids: ["outer"] },
    { offset: 7, length: 3, ids: ["outer", "b"] },
    { offset: 10, length: 2, ids: ["outer"] },
  ]);
});

Deno.test("segmentMarks -- three-way overlap merges all three ids", () => {
  // a: [0,8), b: [3,10), c: [5,7)
  const segs = segmentMarks([
    { offset: 0, length: 8, thread_id: "a" },
    { offset: 3, length: 7, thread_id: "b" },
    { offset: 5, length: 2, thread_id: "c" },
  ]);
  assertEquals(segs, [
    { offset: 0, length: 3, ids: ["a"] },
    { offset: 3, length: 2, ids: ["a", "b"] },
    { offset: 5, length: 2, ids: ["a", "b", "c"] },
    { offset: 7, length: 1, ids: ["a", "b"] },
    { offset: 8, length: 2, ids: ["b"] },
  ]);
});

Deno.test("segmentMarks -- identical spans dedupe ids", () => {
  // Two marks over the exact same range.
  const segs = segmentMarks([
    { offset: 0, length: 4, thread_id: "a" },
    { offset: 0, length: 4, thread_id: "b" },
  ]);
  assertEquals(segs, [{ offset: 0, length: 4, ids: ["a", "b"] }]);
});
