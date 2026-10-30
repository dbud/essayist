import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Client entry files are build inputs by file name; pages without one (login) get no script tag.
const clientEntries = Object.fromEntries(
  readdirSync("src/client/pages")
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => [file.replace(/\.tsx$/, ""), `src/client/pages/${file}`]),
);

function moduleBindings(environment: string, bindings: Record<string, string>): Plugin {
  return {
    name: "essayist:module-bindings",
    enforce: "pre",
    resolveId(source) {
      if (this.environment?.name !== environment) return;
      const binding = bindings[source];
      if (binding === undefined) return;
      return fileURLToPath(new URL(binding, import.meta.url));
    },
  };
}

export default defineConfig({
  plugins: [
    // Specifiers the client environment re-binds to dependency-free modules, keeping server-only
    // modules (happy-dom) out of the client graph.
    moduleBindings("client", {
      "#/editor/withDOM.ts": "./src/editor/withDOM.client.ts",
    }),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "worker" } }),
  ],
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
