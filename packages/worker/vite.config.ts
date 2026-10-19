import { readdirSync } from "node:fs";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Client entry files are build inputs by file name; pages without one
// (login) get no script tag.
const clientEntries = Object.fromEntries(
  readdirSync("src/client/pages")
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => [file.replace(/\.tsx$/, ""), `src/client/pages/${file}`]),
);

export default defineConfig({
  plugins: [tailwindcss(), cloudflare({ viteEnvironment: { name: "worker" } })],
  environments: {
    worker: { build: { sourcemap: true } },
    client: {
      build: {
        rolldownOptions: {
          input: {
            ...clientEntries,
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
    dedupe: ["effect", "@effect/ai-openrouter"],
    // @lexical/react speaks react; preact/compat covers it.
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
});
