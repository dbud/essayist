import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { sentryCloudflareVitePlugin } from "@sentry/cloudflare/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
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

// Uploads both bundles' source maps to Sentry when the deploy envs the plugin (SENTRY_AUTH_TOKEN,
// SENTRY_RELEASE, SENTRY_ORG, SENTRY_PROJECT); anything missing logs a warning and skips. Client
// maps are deleted after upload so the public assets never serve sources.
const sentryMaps = sentryVitePlugin({
  telemetry: false,
  errorHandler: (error) => console.warn(error),
  sourcemaps: {
    assets: [
      "dist/worker/assets/*.js",
      "dist/worker/assets/*.js.map",
      "dist/client/assets/*.js",
      "dist/client/assets/*.js.map",
    ],
    filesToDeleteAfterUpload: "dist/client/assets/*.js.map",
  },
});

export default defineConfig({
  plugins: [
    // Specifiers the client environment re-binds to dependency-free modules, keeping server-only
    // modules (happy-dom) out of the client graph.
    moduleBindings("client", {
      "#/editor/withDOM.ts": "./src/editor/withDOM.client.ts",
    }),
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "worker" } }),
    sentryCloudflareVitePlugin(),
    ...sentryMaps,
  ],
  environments: {
    worker: { build: { sourcemap: true } },
    client: {
      build: {
        sourcemap: true,
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
