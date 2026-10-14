import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { clientEntryPath, PAGE_NAMES } from "./src/app/pages.ts";

export default defineConfig({
  plugins: [tailwindcss(), cloudflare({ viteEnvironment: { name: "worker" } })],
  environments: {
    worker: { build: { sourcemap: true } },
    client: {
      build: {
        rolldownOptions: {
          input: {
            ...Object.fromEntries(
              PAGE_NAMES.map((name) => [name, clientEntryPath(name)]),
            ),
            // The global stylesheet: one entry, referenced by every page.
            styles: "src/client/styles/styles.css",
          },
          output: {
            entryFileNames: "assets/[name].js",
            assetFileNames: "assets/[name][extname]",
          },
        },
      },
    },
  },
  resolve: {
    tsconfigPaths: true,
    dedupe: ["effect", "@effect/ai-openrouter"],
  },
});
