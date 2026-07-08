// Smoke test for the wasm-bindgen glue. Verifies the build pipeline and the
// scalar boundary end-to-end. Requires `deno task wasm:build` first.

import { assert } from "@std/assert";
import { add } from "./test_glue.ts";

Deno.test("wasm smoke -- add(a, b) via bindgen glue", () => {
  assert(add(2, 3) === 5, "add(2, 3) should be 5");
  assert(add(-1, 1) === 0, "add(-1, 1) should be 0");
  assert(add(0, 0) === 0, "add(0, 0) should be 0");
});
