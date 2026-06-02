import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fresh } from "@fresh/plugin-vite";
import { fileURLToPath } from "node:url";

function watchCore() {
  return {
    name: "watch-core",
    // deno-lint-ignore no-explicit-any
    configureServer(server: any) {
      const path = fileURLToPath(new URL("../core", import.meta.url));
      server.watcher.add(path);
    },
  };
}
export default defineConfig({
  plugins: [fresh(), tailwindcss(), watchCore()],
  server: {
    fs: {
      allow: ["../.."],
    },
  },
});
