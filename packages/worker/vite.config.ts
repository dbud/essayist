import fs from "node:fs";
import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

// Vite evaluates this config more than once, with different working
// directories (and transpiles it to a temp file), so everything derives from
// a marker walk-up instead of cwd: the repo root holds both config files.
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    const hasDenoJson = fs.existsSync(path.join(dir, "deno.jsonc"));
    const hasWranglerJson = fs.existsSync(path.join(dir, "wrangler.jsonc"));
    if (hasDenoJson && hasWranglerJson) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `could not locate the repo root walking up from ${process.cwd()}`,
      );
    }
    dir = parent;
  }
}

const repo = findRepoRoot();
const workerRoot = path.join(repo, "packages/worker");
const coreSrc = path.join(repo, "packages/core/src");

export default defineConfig({
  root: workerRoot,
  plugins: [
    cloudflare({
      viteEnvironment: { name: "worker" },
      configPath: path.join(repo, "wrangler.jsonc"),
    }),
  ],
  environments: {
    worker: { build: { sourcemap: true } },
  },
  resolve: {
    alias: [{ find: /^@\//, replacement: `${coreSrc}/` }],
    dedupe: ["effect", "@effect/ai-openrouter"],
  },
});
