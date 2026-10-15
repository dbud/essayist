import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { clientEntryPath, PAGE_NAMES } from "./src/app/pages.ts";

const bindStub = () =>
  new URL("./src/deno-kv-native-stub.ts", import.meta.url).pathname;

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
    alias: {
      "@deno/kv-win32-x64-msvc": bindStub(),
      "@deno/kv-linux-x64-gnu": bindStub(),
      "@deno/kv-linux-arm64-gnu": bindStub(),
      "@deno/kv-darwin-x64": bindStub(),
      "@deno/kv-darwin-arm64": bindStub(),
    },
    dedupe: ["effect", "@effect/ai-openrouter"],
  },
});
