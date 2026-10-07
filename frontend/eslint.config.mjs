import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

// Frontend 独立 flat config：Next 16 移除了 `next lint`，直接用根工作区的
// eslint 二进制跑本文件。规则与根 eslint.config.mjs 对齐（no-explicit-any 降
// warn、unused-vars 为 error、^_ 前缀豁免），另外提供 browser 全局与 .next 忽略。
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-namespace": "off",
    },
  },
  {
    // CommonJS 配置文件（next.config.js / postcss.config.js）运行在 Node 侧
    files: ["*.config.js", "*.config.mjs", "*.config.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: [".next/", "node_modules/", "out/"],
  }
);
