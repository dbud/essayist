import { fileURLToPath } from "node:url";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

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
        if (!url.searchParams.has("worker_file")) {
          return next();
        }
        server.environments.client
          .transformRequest(req.url ?? "")
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
  plugins: [serveWorkers(), fresh(), tailwindcss(), watchCore()],
  worker: {
    plugins: () => [fresh()],
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
