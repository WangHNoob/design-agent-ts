import { describe, expect, it } from "vitest";
import { ToolRiskResolver } from "../../../src/core/tool/ToolRiskResolver.js";

const baseConfig = {
  toolRiskOverrides: {},
  irreversibleToolNames: [] as string[],
  irreversibleNameKeywords: ["delete", "drop", "rm"],
};

describe("ToolRiskResolver", () => {
  it("does not treat format_tool or param_x as irreversible via rm keyword", () => {
    const resolver = new ToolRiskResolver(baseConfig);
    expect(resolver.resolve("format_tool")).toBe("write");
    expect(resolver.resolve("param_x")).toBe("write");
  });

  it("treats rm_file and kb_delete_page as irreversible via whole-token keywords", () => {
    const resolver = new ToolRiskResolver(baseConfig);
    expect(resolver.resolve("rm_file")).toBe("irreversible");
    expect(resolver.resolve("kb_delete_page")).toBe("irreversible");
  });

  it("prefers irreversible list/keywords over descriptor read hint", () => {
    const resolver = new ToolRiskResolver({
      ...baseConfig,
      irreversibleToolNames: ["safe_read_delete"],
    });
    expect(resolver.resolve("safe_read_delete", "read")).toBe("irreversible");
    expect(resolver.resolve("rm_backup", "read")).toBe("irreversible");
  });

  it("uses descriptor risk when not irreversible by list/keywords", () => {
    const resolver = new ToolRiskResolver(baseConfig);
    expect(resolver.resolve("wiki_read", "read")).toBe("read");
    expect(resolver.resolve("custom_tool", "write")).toBe("write");
  });

  it("toolRiskOverrides remain highest priority", () => {
    const resolver = new ToolRiskResolver({
      ...baseConfig,
      toolRiskOverrides: { rm_file: "read" },
    });
    expect(resolver.resolve("rm_file", "irreversible")).toBe("read");
  });
});
