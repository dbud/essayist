// Smoke test for the wasm-bindgen glue.
//
// `crates/wasm/pkg/` is a build artifact (gitignored) produced by
// `deno task wasm:build`. This test is skipped when the glue is absent, so
// `deno test` works without a build locally; CI builds the package first, so
// the test runs there and actually exercises the JS<->Rust boundary.

const glueUrl = new URL("./pkg/wasm.js", import.meta.url);
const wasmUrl = new URL("./pkg/wasm_bg.wasm", import.meta.url);

let built = true;
try {
  await Deno.stat(glueUrl);
  await Deno.stat(wasmUrl);
} catch {
  built = false;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

Deno.test({
  name: "wasm smoke -- add(a, b) via bindgen glue",
  ignore: !built,
  async fn() {
    const glue = await import(glueUrl.href);
    // initSync takes raw wasm bytes, avoiding any fetch/file-URL wrangling.
    glue.initSync({ module: await Deno.readFile(wasmUrl) });
    assert(glue.add(2, 3) === 5, "add(2, 3) should be 5");
    assert(glue.add(-1, 1) === 0, "add(-1, 1) should be 0");
    assert(glue.add(0, 0) === 0, "add(0, 0) should be 0");
  },
});
