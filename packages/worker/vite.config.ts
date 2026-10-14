import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
import { clientEntryPath, pageNames } from "./src/app/pages.ts";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "worker" } })],
  environments: {
    worker: { build: { sourcemap: true } },
    client: {
      build: {
        rolldownOptions: {
          input: Object.fromEntries(
            pageNames.map((name) => [name, clientEntryPath(name)]),
          ),
          output: { entryFileNames: "assets/[name].js" },
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["effect", "@effect/ai-openrouter"],
  },
});
