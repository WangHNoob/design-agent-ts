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
  // Layer boundary: core must not reach adapter/server, use Node built-ins,
  // or depend on third-party packages outside the whitelist (zod → structured/ only).
  {
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/adapter/**", "**/server/**"],
            message: "core/ 层禁止 import adapter/ 或 server/。依赖必须通过 port 接口注入。",
          },
          {
            group: ["node:*"],
            message: "core/ 层禁止直接使用 Node 内置模块（基础设施 API）。文件/网络/时间等应通过 port 抽象。",
          },
        ],
        paths: [
          { name: "fs", message: "core/ 层禁止直接使用 fs（基础设施 API），应通过 FileSystemPort。" },
          { name: "path", message: "core/ 层禁止直接使用 path（基础设施 API），应通过 FileSystemPort。" },
          { name: "zod", message: "core/ 中 zod 仅允许在 core/structured/ 内使用（结构化输出校验）。其余 core 代码禁止第三方依赖。" },
        ],
      }],
    },
  },
  // core/structured is the single allowed zod home: this block overrides the
  // core block above (flat config: later matching config wins), keeping the
  // adapter/server/Node built-in restrictions while dropping the zod ban.
  {
    files: ["src/core/structured/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/adapter/**", "**/server/**"],
            message: "core/ 层禁止 import adapter/ 或 server/。依赖必须通过 port 接口注入。",
          },
          {
            group: ["node:*"],
            message: "core/ 层禁止直接使用 Node 内置模块（基础设施 API）。文件/网络/时间等应通过 port 抽象。",
          },
        ],
        paths: [
          { name: "fs", message: "core/ 层禁止直接使用 fs（基础设施 API），应通过 FileSystemPort。" },
          { name: "path", message: "core/ 层禁止直接使用 path（基础设施 API），应通过 FileSystemPort。" },
        ],
      }],
    },
  },
  // Dependency whitelist: zod is the ONLY third-party dependency allowed in core,
  // and only inside core/structured (LLM structured-output validation).
  // NOTE: implemented as the core block above (ban zod everywhere in core) plus a
  // structured override that re-declares restrictions without the zod ban — the
  // override must stay in sync with the core block's pattern list.

  // Layer boundary: ports are pure contracts — never import core/adapter/server.
  {
    files: ["src/port/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/core/**", "**/adapter/**", "**/server/**"],
            message: "port/ 层禁止 import core/、adapter/、server/。端口契约必须自包含。",
          },
          {
            group: ["fs", "path", "node:*"],
            message: "port/ 层必须是纯类型契约，禁止基础设施 import。",
          },
        ],
      }],
    },
  },
  // Layer boundary: config only loads configuration — never instantiates adapters.
  {
    files: ["src/config/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["**/adapter/**", "**/server/**"],
            message: "config/ 层禁止引用 adapter/ 或 server/。依赖注入容器应放在 server/ 组装根。",
          },
        ],
      }],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/", "sessions/"],
  }
);
