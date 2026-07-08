// Tests for the Int32Array sort example. Proves the boundary shape Myers will
// rely on (Int32Array in, Int32Array out): the input is not mutated and the
// result is a fresh typed array of the same length. Requires `deno task
// wasm:build` first.

import { assert, assertEquals } from "@std/assert";
import { sort_ints } from "./test_glue.ts";

Deno.test("wasm sort_ints -- sorts an unsorted Int32Array", () => {
  const out = sort_ints(new Int32Array([5, 3, 8, 1, 9, 2]));
  assert(out instanceof Int32Array, "result should be an Int32Array");
  assertEquals(Array.from(out), [1, 2, 3, 5, 8, 9]);
});

Deno.test("wasm sort_ints -- does not mutate the input", () => {
  const input = new Int32Array([5, 3, 8, 1]);
  sort_ints(input);
  assertEquals(Array.from(input), [5, 3, 8, 1]);
});

Deno.test("wasm sort_ints -- empty and single-element arrays", () => {
  assertEquals(Array.from(sort_ints(new Int32Array())), []);
  assertEquals(Array.from(sort_ints(new Int32Array([42]))), [42]);
});

Deno.test("wasm sort_ints -- duplicates and already-sorted input", () => {
  assertEquals(
    Array.from(sort_ints(new Int32Array([3, 1, 3, 1, 2]))),
    [1, 1, 2, 3, 3],
  );
  assertEquals(
    Array.from(sort_ints(new Int32Array([1, 2, 3, 4]))),
    [1, 2, 3, 4],
  );
});

Deno.test("wasm sort_ints -- large array (marshalling sanity)", () => {
  const n = 100_000;
  const input = new Int32Array(n);
  for (let i = 0; i < n; i++) input[i] = n - i - 1; // descending
  const out = sort_ints(input);
  assertEquals(out.length, n);
  assert(out[0] === 0 && out[n - 1] === n - 1, "extremes sorted");
  let ok = true;
  for (let i = 1; i < n; i++) {
    if (out[i] < out[i - 1]) {
      ok = false;
      break;
    }
  }
  assert(ok, "result should be monotonic");
});
