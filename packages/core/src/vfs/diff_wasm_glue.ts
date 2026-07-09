// WASM glue for the diff path.
//
// Imports `@essayist/wasm` (the workspace package built by `deno task
// wasm:build`), synchronously inits the module with the wasm bytes, and
// re-exports the `myers` fn for injection into `diff.ts` via `setMyers`.
//
// This module is Deno-only (it reads the wasm bytes from disk with
// `Deno.readFileSync`); it is imported only by the diff wasm tests, never by
// `diff.ts` itself, so the browser bundle stays free of the wasm glue until
// it's explicitly enabled. Requires `deno task wasm:build` first.

import { initSync, myers } from "@essayist/wasm";

// `@essayist/wasm` resolves to `crates/wasm/pkg/wasm.js`; the wasm bytes sit
// alongside it as `wasm_bg.wasm` (wasm-bindgen's --target web convention).
const wasmJsUrl = import.meta.resolve("@essayist/wasm");
initSync({ module: Deno.readFileSync(new URL("wasm_bg.wasm", wasmJsUrl)) });

export { myers };
