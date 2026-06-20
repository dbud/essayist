import { fileURLToPath } from "node:url";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type ViteDevServer } from "vite";

function watchCore() {
  return {
    name: "watch-core",
    configureServer(server: ViteDevServer) {
      const path = fileURLToPath(new URL("../core", import.meta.url));
      server.watcher.add(path);
    },
  };
}

export default defineConfig({
  plugins: [fresh(), tailwindcss(), watchCore()],
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
