import { describe, expect, it, vi } from "vitest";
import type { ToolPort } from "../../../src/port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../../src/port/tool/ToolDescriptor.js";
import { ToolResult } from "../../../src/port/tool/ToolResult.js";
import { InMemoryAuditStore } from "../../../src/core/audit/InMemoryAuditStore.js";
import { InMemoryToolApprovalStore } from "../../../src/core/tool/InMemoryToolApprovalStore.js";
import { ToolSecurityWrapper } from "../../../src/core/tool/ToolSecurityWrapper.js";
import { hashToolCall } from "../../../src/core/guard/hash.js";
import { ToolHitlRequiredError } from "../../../src/core/tool/ToolHitlRequiredError.js";

function mockIdGen() {
  let n = 0;
  return { randomUUID: () => `audit-id-${++n}` };
}

function baseTool(name: string, execute = vi.fn().mockResolvedValue(ToolResult.success("ok"))): ToolPort {
  return {
    getDescriptor(): ToolDescriptor {
      return {
        name,
        description: "test",
        parameters: {},
        riskLevel: name.includes("delete") ? "irreversible" : undefined,
      };
    },
    execute,
  };
}

describe("ToolSecurityWrapper", () => {
  it("rejects sandbox path traversal", async () => {
    const audit = new InMemoryAuditStore(mockIdGen());
    const wrapped = new ToolSecurityWrapper(baseTool("workspace_read"), {
      resolveRiskLevel: () => "read",
      approvalStore: new InMemoryToolApprovalStore(),
      sandbox: { denyKeywords: [], blockPathTraversal: true },
      auditEnabled: true,
      auditStore: audit,
      irreversibleRequireHitl: true,
      resolveContext: () => ({ userId: "u1", sessionId: "s1" }),
    });

    const result = await wrapped.execute({ path: "../../etc/passwd" });
    expect(result.isError).toBe(true);
    expect(result.metadata.permissionDenied).toBe(true);
    expect(audit.all().some((e) => e.action === "tool.denied")).toBe(true);
  });

  it("denies irreversible tool without approval", async () => {
    const audit = new InMemoryAuditStore(mockIdGen());
    const execute = vi.fn().mockResolvedValue(ToolResult.success("deleted"));
    const wrapped = new ToolSecurityWrapper(baseTool("test_delete_item", execute), {
      resolveRiskLevel: () => "irreversible",
      approvalStore: new InMemoryToolApprovalStore(),
      sandbox: { denyKeywords: [], blockPathTraversal: true },
      auditEnabled: true,
      auditStore: audit,
      irreversibleRequireHitl: true,
      resolveContext: () => ({ userId: "u1", sessionId: "s1" }),
    });

    const args = { id: "x" };
    const result = await wrapped.execute(args);
    expect(result.isError).toBe(true);
    expect(result.metadata.requiresHitl).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(audit.all().find((e) => e.action === "tool.denied")?.detail?.reason).toBe(
      "irreversible_not_approved",
    );
  });

  it("allows irreversible tool after approval grant", async () => {
    const audit = new InMemoryAuditStore(mockIdGen());
    const approval = new InMemoryToolApprovalStore();
    const execute = vi.fn().mockResolvedValue(ToolResult.success("deleted"));
    const toolName = "test_delete_item";
    const args = { id: "x" };
    const argsHash = hashToolCall(toolName, args);

    approval.grant({
      userId: "u1",
      sessionId: "s1",
      toolName,
      argsHash,
      approvalId: "hitl-cp-1",
    });

    const wrapped = new ToolSecurityWrapper(baseTool(toolName, execute), {
      resolveRiskLevel: () => "irreversible",
      approvalStore: approval,
      sandbox: { denyKeywords: [], blockPathTraversal: true },
      auditEnabled: true,
      auditStore: audit,
      irreversibleRequireHitl: true,
      resolveContext: () => ({ userId: "u1", sessionId: "s1" }),
    });

    const result = await wrapped.execute(args);
    expect(result.isError).toBe(false);
    expect(execute).toHaveBeenCalledOnce();
    expect(audit.all().some((e) => e.action === "tool.invoke")).toBe(true);
  });

  it("does not audit read-level tool invocations", async () => {
    const audit = new InMemoryAuditStore(mockIdGen());
    const wrapped = new ToolSecurityWrapper(baseTool("wiki_read"), {
      resolveRiskLevel: () => "read",
      approvalStore: new InMemoryToolApprovalStore(),
      sandbox: { denyKeywords: [], blockPathTraversal: false },
      auditEnabled: true,
      auditStore: audit,
      irreversibleRequireHitl: true,
      resolveContext: () => ({ userId: "u1", sessionId: "s1" }),
    });

    await wrapped.execute({ pagePath: "foo" });
    expect(audit.all()).toHaveLength(0);
  });

  it("throws ToolHitlRequiredError when checkpoint and executionId are present", async () => {
    const execute = vi.fn().mockResolvedValue(ToolResult.success("deleted"));
    const wrapped = new ToolSecurityWrapper(baseTool("test_delete_item", execute), {
      resolveRiskLevel: () => "irreversible",
      approvalStore: new InMemoryToolApprovalStore(),
      sandbox: { denyKeywords: [], blockPathTraversal: true },
      auditEnabled: false,
      irreversibleRequireHitl: true,
      resolveContext: () => ({ userId: "u1", sessionId: "s1", executionId: "exec-1" }),
      onIrreversibleDenied: async () => "cp-tool-1",
    });

    await expect(wrapped.execute({ id: "x" })).rejects.toBeInstanceOf(ToolHitlRequiredError);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns error result when no executionId (compat without execution context)", async () => {
    const execute = vi.fn().mockResolvedValue(ToolResult.success("deleted"));
    const wrapped = new ToolSecurityWrapper(baseTool("test_delete_item", execute), {
      resolveRiskLevel: () => "irreversible",
      approvalStore: new InMemoryToolApprovalStore(),
      sandbox: { denyKeywords: [], blockPathTraversal: true },
      auditEnabled: false,
      irreversibleRequireHitl: true,
      resolveContext: () => ({ userId: "u1", sessionId: "s1" }),
      onIrreversibleDenied: async () => "cp-tool-1",
    });

    const result = await wrapped.execute({ id: "x" });
    expect(result.isError).toBe(true);
    expect(result.metadata.requiresHitl).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});
