import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "worker" } })],
  environments: {
    worker: { build: { sourcemap: true } },
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["effect", "@effect/ai-openrouter"],
  },
});
