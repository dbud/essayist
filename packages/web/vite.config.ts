import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { fresh } from "@fresh/plugin-vite";

export default defineConfig({
  plugins: [fresh(), tailwindcss()],
  server: {
    fs: {
      allow: ["../.."],
    },
  },
});
