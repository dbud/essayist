// Runs the shared diff cases through the WASM Myers core, and asserts the JS
// and WASM cores produce byte-identical ops (the convergence guard).
// Requires `deno task wasm:build` first (the glue imports `@essayist/wasm`).

import { assertEquals } from "@std/assert";
import { computeDiffWith, jsMyers } from "./diff.ts";
import { runDiffCases } from "./diff_cases.ts";
import { myers } from "./diff_wasm_glue.ts";

// `diff_test.ts` runs the shared cases through `computeDiff` (JS core, the
// default); here we run them through `computeDiffWith(..., myers)` (WASM core).
// The two cores are byte-identical, so the shared cases have one set of
// expectations, and together the two files cover both paths.
runDiffCases("computeDiffWith", (oldText, newText) =>
  computeDiffWith(oldText, newText, myers),
);

// Direct convergence guard: the JS and WASM cores must emit the exact same
// flat op Int32Array for the same int-id inputs, including repeated-token
// (ambiguous LCS) cases where tie-breaks could diverge.

function assertCoresAgree(a: Int32Array, b: Int32Array): void {
  assertEquals(
    Array.from(jsMyers(a, b)),
    Array.from(myers(a, b)),
    `cores disagree\n a = ${JSON.stringify(Array.from(a))}\n b = ${JSON.stringify(
      Array.from(b),
    )}`,
  );
}

Deno.test("myers cores -- JS and WASM agree on fixed cases", () => {
  assertCoresAgree(new Int32Array([1, 2, 3]), new Int32Array([1, 2, 3]));
  assertCoresAgree(new Int32Array([1, 2, 3]), new Int32Array([]));
  assertCoresAgree(new Int32Array([]), new Int32Array([1, 2, 3]));
  assertCoresAgree(new Int32Array([1, 2, 3]), new Int32Array([1, 4, 2, 3]));
  assertCoresAgree(new Int32Array([1, 4, 2, 3]), new Int32Array([1, 2, 3]));
  assertCoresAgree(new Int32Array([1, 2]), new Int32Array([1, 2, 3]));
  assertCoresAgree(new Int32Array([3, 1, 2]), new Int32Array([1, 2]));
  // Repeated tokens (ambiguous LCS) -- the regime where tie-breaks matter.
  assertCoresAgree(
    new Int32Array([1, 2, 1, 3, 2]),
    new Int32Array([1, 3, 1, 2]),
  );
  assertCoresAgree(new Int32Array([1, 1, 1, 1]), new Int32Array([1, 1]));
});

// Deterministic 31-bit LCG so the random agreement test is reproducible.
class Lcg {
  s: number;
  constructor(seed: number) {
    this.s = seed;
  }
  next(): number {
    this.s = (this.s * 1664525 + 1013904223) & 0x7fffffff;
    return this.s;
  }
}

Deno.test("myers cores -- JS and WASM agree on random inputs", () => {
  const rng = new Lcg(0x9e3779b9);
  for (let i = 0; i < 2000; i++) {
    const n = rng.next() % 25;
    const m = rng.next() % 25;
    const a = Int32Array.from({ length: n }, () => rng.next() % 5);
    const b = Int32Array.from({ length: m }, () => rng.next() % 5);
    assertCoresAgree(a, b);
  }
});
