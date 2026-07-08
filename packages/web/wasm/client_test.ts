// End-to-end test of the wasm sort worker via client. In Deno,
// `import.meta.env` is undefined so client uses the Worker path; Deno
// supports module workers natively and `fetch` serves the wasm bytes from
// disk. Requires `deno task wasm:build` first.

import { assert, assertEquals } from "@std/assert";
import { sortInts } from "./client.ts";

Deno.test("wasm client -- sorts an Int32Array via worker", async () => {
  const out = await sortInts(new Int32Array([5, 3, 8, 1, 9, 2]));
  assert(out instanceof Int32Array, "result should be an Int32Array");
  assertEquals(Array.from(out), [1, 2, 3, 5, 8, 9]);
});

Deno.test("wasm client -- empty, single, duplicates", async () => {
  assertEquals(Array.from(await sortInts(new Int32Array())), []);
  assertEquals(Array.from(await sortInts(new Int32Array([42]))), [42]);
  assertEquals(
    Array.from(await sortInts(new Int32Array([3, 1, 3, 1, 2]))),
    [1, 1, 2, 3, 3],
  );
});
