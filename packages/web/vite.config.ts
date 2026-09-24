import { fileURLToPath } from "node:url";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { assetGenerate } from "./vite/asset-generate.ts";

function watchCore(): Plugin {
  return {
    name: "watch-core",
    configureServer(server: ViteDevServer) {
      const path = fileURLToPath(new URL("../core", import.meta.url));
      server.watcher.add(path);
    },
  };
}

function serveWorkers(): Plugin {
  return {
    name: "serve-workers",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "", "http://localhost");
        // Prod builds emit the worker via the "worker" environment; in
        // dev, transform the entry through the client environment
        if (url.pathname !== "/wasm-worker.js") {
          return next();
        }
        server.environments.client
          .transformRequest("/wasm/worker.ts")
          .then((result) => {
            if (result == null) return next();
            res.setHeader(
              "Content-Type",
              "application/javascript; charset=utf-8",
            );
            res.statusCode = 200;
            res.end(result.code);
          })
          .catch((err) => next(err as unknown as Error));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    assetGenerate(),
    serveWorkers(),
    fresh(),
    tailwindcss(),
    watchCore(),
  ],
  environments: {
    worker: {
      consumer: "client",
      build: {
        // The deployed web root, shared with the client env output
        outDir: "_fresh/client",
        emptyOutDir: false,
        copyPublicDir: false,
        manifest: false,
        emitAssets: true,
        // Inline the wasm so the worker stays a single file
        assetsInlineLimit: 100_000_000,
        rolldownOptions: {
          input: {
            "wasm-worker": "wasm/worker.ts",
          },
          output: {
            entryFileNames: "wasm-worker.js",
          },
        },
      },
    },
  },
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      "react-dom/client": "preact/compat/client",
    },
  },
  server: {
    fs: {
      allow: ["../.."],
    },
  },
});
