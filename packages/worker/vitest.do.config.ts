import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Runs inside workerd; the test-only entry keeps the app graph out of the bundle.
export default defineConfig(async () => {
  const migrationsDir = fileURLToPath(
    new URL(".", import.meta.resolve("@essayist/core/migrations")),
  );
  const migrations = await readD1Migrations(migrationsDir);
  return {
    plugins: [
      cloudflareTest({
        main: "./tests/worker.ts",
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ["tests/**/*_test.ts"],
    },
  };
});
