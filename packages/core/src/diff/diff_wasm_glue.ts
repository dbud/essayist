// WASM glue for the diff path.
//
// Imports `@essayist/wasm` (built by wasm-pack from `crates/wasm`), synchronously inits the module
// with the wasm bytes, and re-exports the `myers` fn for injection into `diff.ts` via `setMyers`.
//
// This module reads the wasm bytes from disk with `Deno.readFileSync`, so it runs under Deno only;
// it is imported only by the diff wasm tests, never by `diff.ts` itself, so the browser bundle
// stays free of the wasm glue until a Node-readable loader lands with ESS-90. Requires a wasm-pack
// build of `crates/wasm` first.

import { initSync, myers } from "@essayist/wasm";

// `@essayist/wasm` resolves to `crates/wasm/pkg/wasm.js`; the wasm bytes sit alongside it as
// `wasm_bg.wasm` (the --target web convention of wasm-bindgen).
const wasmJsUrl = import.meta.resolve("@essayist/wasm");
initSync({ module: Deno.readFileSync(new URL("wasm_bg.wasm", wasmJsUrl)) });

export { myers };
