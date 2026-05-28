import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-namespace": "off",
    },
  },
  {
    files: ["src/core/**/*.ts", "src/port/**/*.ts", "src/config/**/*.ts", "src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@langchain/**"],
          message: "core/, port/, config/, server/ 目录禁止引入 @langchain/* 依赖。框架依赖应隔离在 adapter/ 层。",
        }],
      }],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/", "sessions/"],
  }
);
