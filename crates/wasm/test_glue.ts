// Shared wasm glue loader for the crate's Deno tests.
//
// Importing this module inits the bindgen glue once. `crates/wasm/pkg/` is a
// gitignored build artifact produced by `deno task wasm:build`; if it isn't
// built, tests importing this fail to resolve it (run `deno task wasm:build`).

import { add, initSync, sort_ints } from "./pkg/wasm.js";

const wasm = await Deno.readFile(
  new URL("./pkg/wasm_bg.wasm", import.meta.url),
);
initSync({ module: wasm });

export { add, sort_ints };
