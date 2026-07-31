import { describe, expect, it } from "vitest";
import { validateToolArgsSandbox, sanitizePathSegment } from "../../../src/core/tool/ToolParamSandbox.js";

describe("ToolParamSandbox", () => {
  const config = {
    denyKeywords: ["DROP TABLE", "rm -rf"],
    blockPathTraversal: true,
  };

  it("rejects path traversal sequences", () => {
    const violation = validateToolArgsSandbox({ path: "../secret" }, config);
    expect(violation?.reason).toContain("Path traversal");
  });

  it("rejects absolute paths", () => {
    const violation = validateToolArgsSandbox({ path: "/etc/passwd" }, config);
    expect(violation?.reason).toContain("Absolute paths");
  });

  it("rejects configured deny keywords", () => {
    const violation = validateToolArgsSandbox({ query: "please DROP TABLE users" }, config);
    expect(violation?.reason).toContain("DROP TABLE");
  });

  it("sanitizePathSegment aligns with workspace sanitize semantics", () => {
    expect(sanitizePathSegment("foo:bar")).toBe("foo_bar");
    expect(sanitizePathSegment("...")).toBe("_");
  });
});
