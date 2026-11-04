import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs inside workerd; the test-only entry keeps the app graph out of the bundle.
export default defineConfig({
  plugins: [
    cloudflareTest({ main: "./tests/worker.ts", wrangler: { configPath: "./wrangler.jsonc" } }),
  ],
  test: {
    include: ["tests/**/*_test.ts"],
  },
});
