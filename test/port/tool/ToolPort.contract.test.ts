import { describe, it, expectTypeOf } from "vitest";
import type { ToolPort } from "../../../src/port/tool/ToolPort";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor";
import type { ToolResult } from "../../../src/port/tool/ToolResult";

describe("ToolPort 契约测试", () => {
  it("ToolPort 接口应有正确的方法签名", () => {
    expectTypeOf<ToolPort>().toHaveProperty("getDescriptor").toBeFunction();
    expectTypeOf<ToolPort>().toHaveProperty("execute").toBeFunction();
  });

  it("ToolDescriptor 应有正确的字段", () => {
    expectTypeOf<ToolDescriptor>().toHaveProperty("name").toBeString();
    expectTypeOf<ToolDescriptor>().toHaveProperty("description").toBeString();
    expectTypeOf<ToolDescriptor>().toHaveProperty("parameters").toBeObject();
  });

  it("ToolResult 应有正确的字段", () => {
    expectTypeOf<ToolResult>().toHaveProperty("output").toBeString();
    expectTypeOf<ToolResult>().toHaveProperty("isError").toBeBoolean();
    expectTypeOf<ToolResult>().toHaveProperty("metadata").toBeObject();
  });
});
