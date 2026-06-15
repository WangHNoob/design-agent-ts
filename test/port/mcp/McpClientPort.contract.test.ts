import { describe, it, expectTypeOf } from "vitest";
import type {
  McpClientPort,
  McpToolDefinition,
  McpToolCallResult,
} from "../../../src/port/mcp/McpClientPort";

describe("McpClientPort 契约测试", () => {
  it("McpClientPort 接口应有正确的方法签名", () => {
    expectTypeOf<McpClientPort>().toHaveProperty("serverName").toBeString();
    expectTypeOf<McpClientPort>().toHaveProperty("connect").toBeFunction();
    expectTypeOf<McpClientPort>().toHaveProperty("disconnect").toBeFunction();
    expectTypeOf<McpClientPort>().toHaveProperty("listTools").toBeFunction();
    expectTypeOf<McpClientPort>().toHaveProperty("callTool").toBeFunction();
    expectTypeOf<McpClientPort>().toHaveProperty("isConnected").toBeFunction();
  });

  it("McpToolDefinition 应有正确的字段", () => {
    expectTypeOf<McpToolDefinition>().toHaveProperty("name").toBeString();
    expectTypeOf<McpToolDefinition>().toHaveProperty("description").toBeString();
    expectTypeOf<McpToolDefinition>().toHaveProperty("inputSchema").toBeObject();
  });

  it("McpToolCallResult 应有正确的字段", () => {
    expectTypeOf<McpToolCallResult>().toHaveProperty("content").toBeString();
    expectTypeOf<McpToolCallResult>().toHaveProperty("isError").toBeBoolean();
    expectTypeOf<McpToolCallResult>().toHaveProperty("metadata").toBeObject();
  });
});
