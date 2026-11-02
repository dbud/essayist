import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/**/*_test.ts",
      "scripts/**/*_test.tsx",
      "src/**/*_test.ts",
      "src/**/*_test.tsx",
    ],
  },
});
