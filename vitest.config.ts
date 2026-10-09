import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
      // frontend 组件层在测试中引用（frontend/tsconfig 的 @/* 别名）
      "@": fileURLToPath(new URL("./frontend", import.meta.url)),
    },
  },
});
