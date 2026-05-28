import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*"],
      exclude: ["src/**/*.d.ts", "src/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@port": "./src/port",
      "@core": "./src/core",
      "@adapter": "./src/adapter",
    },
  },
});
