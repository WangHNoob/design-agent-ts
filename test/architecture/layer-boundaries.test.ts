/**
 * Layer-boundary enforcement test.
 *
 * Guards the hexagonal (ports & adapters) dependency rules that AGENTS.md
 * declares, by scanning actual import statements in src/:
 *
 *   - core/   must not import adapter/ or server/; must not use Node built-ins
 *             (fs/path/node:*); zod is allowed ONLY inside core/structured/
 *   - port/   must not import core/, adapter/ or server/; must be pure contracts
 *             (no Node built-ins)
 *   - config/ must not import adapter/ or server/
 *
 * This is a belt-and-suspenders layer on top of the eslint
 * `no-restricted-imports` rules: it keeps working even if the eslint config
 * is accidentally weakened, and it runs in the normal test suite.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..", "src");

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(p));
    else if (entry.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Extract every module specifier imported statically or dynamically. */
function extractImports(code: string): string[] {
  const mods = new Set<string>();
  const patterns = [
    /from\s+["']([^"']+)["']/g, // import ... from 'x' / export ... from 'x'
    /import\s*\(\s*["']([^"']+)["']\s*\)/g, // dynamic import('x')
    /^\s*import\s+["']([^"']+)["']/gm, // side-effect import 'x'
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) mods.add(m[1]);
  }
  return [...mods];
}

function isAdapterImport(spec: string): boolean {
  return /(^|\/)adapter\//.test(spec);
}
function isServerImport(spec: string): boolean {
  return /(^|\/)server\//.test(spec);
}
function isCoreImport(spec: string): boolean {
  return /(^|\/)core\//.test(spec);
}
function isNodeBuiltin(spec: string): boolean {
  return spec.startsWith("node:") || spec === "fs" || spec === "path";
}
function isZod(spec: string): boolean {
  return spec === "zod";
}

function rel(path: string): string {
  return path.slice(SRC.length + 1).replace(/\\/g, "/");
}

const files = collectTsFiles(SRC);

describe("layer boundaries (AGENTS.md)", () => {
  it("core/ never imports adapter/ or server/", () => {
    const violations: string[] = [];
    for (const f of files.filter((f) => rel(f).startsWith("core/"))) {
      const code = readFileSync(f, "utf8");
      for (const spec of extractImports(code)) {
        if (isAdapterImport(spec) || isServerImport(spec)) {
          violations.push(`${rel(f)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("core/ never uses Node built-ins (fs/path/node:*)", () => {
    const violations: string[] = [];
    for (const f of files.filter((f) => rel(f).startsWith("core/"))) {
      const code = readFileSync(f, "utf8");
      for (const spec of extractImports(code)) {
        if (isNodeBuiltin(spec)) violations.push(`${rel(f)} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("core/ uses zod only inside core/structured/", () => {
    const violations: string[] = [];
    for (const f of files.filter((f) => rel(f).startsWith("core/"))) {
      const code = readFileSync(f, "utf8");
      for (const spec of extractImports(code)) {
        if (isZod(spec) && !rel(f).startsWith("core/structured/")) {
          violations.push(`${rel(f)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("port/ never imports core/, adapter/ or server/", () => {
    const violations: string[] = [];
    for (const f of files.filter((f) => rel(f).startsWith("port/"))) {
      const code = readFileSync(f, "utf8");
      for (const spec of extractImports(code)) {
        if (isCoreImport(spec) || isAdapterImport(spec) || isServerImport(spec)) {
          violations.push(`${rel(f)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("port/ is a pure contract layer (no Node built-ins)", () => {
    const violations: string[] = [];
    for (const f of files.filter((f) => rel(f).startsWith("port/"))) {
      const code = readFileSync(f, "utf8");
      for (const spec of extractImports(code)) {
        if (isNodeBuiltin(spec)) violations.push(`${rel(f)} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("config/ never imports adapter/ or server/", () => {
    const violations: string[] = [];
    for (const f of files.filter((f) => rel(f).startsWith("config/"))) {
      const code = readFileSync(f, "utf8");
      for (const spec of extractImports(code)) {
        if (isAdapterImport(spec) || isServerImport(spec)) {
          violations.push(`${rel(f)} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
