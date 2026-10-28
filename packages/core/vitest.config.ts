import { fileURLToPath } from "node:url";

import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // TODO: remove once the WASM diff worker returns (ESS-90) and
    // diff_wasm_test can run again.
    exclude: [...defaultExclude, "src/diff/diff_wasm_test.ts"],
    include: ["src/**/*_test.ts"],
  },
});
