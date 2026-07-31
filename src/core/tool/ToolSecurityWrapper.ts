import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolRiskLevel } from "../../port/tool/ToolRiskLevel.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type { ToolApprovalPort } from "../../port/tool/ToolApprovalPort.js";
import { hashToolCall } from "../guard/hash.js";
import { validateToolArgsSandbox, type ToolSandboxConfig } from "./ToolParamSandbox.js";
import { ToolHitlRequiredError } from "./ToolHitlRequiredError.js";

export interface ToolSecurityContext {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly executionId?: string;
  readonly traceId?: string;
  readonly ip?: string;
  readonly userAgent?: string;
}

export interface IrreversibleDeniedInput {
  readonly userId: string;
  readonly sessionId: string;
  readonly toolName: string;
  readonly argsHash: string;
  readonly argsSummary: Record<string, unknown>;
  readonly executionId?: string;
  readonly traceId?: string;
}

export interface ToolSecurityOptions {
  resolveRiskLevel: (toolName: string, descriptor?: ToolRiskLevel) => ToolRiskLevel;
  approvalStore: ToolApprovalPort;
  sandbox: ToolSandboxConfig;
  auditEnabled: boolean;
  auditStore?: AuditStorePort;
  irreversibleRequireHitl: boolean;
  resolveContext: () => ToolSecurityContext;
  /** Optional: create HITL checkpoint when irreversible tool is denied. */
  onIrreversibleDenied?: (input: IrreversibleDeniedInput) => Promise<string | undefined>;
}

/**
 * Security envelope: parameter sandbox, irreversible HITL gate, audit logging.
 * Wrap outside resilience so denied irreversible calls never hit external APIs.
 */
export class ToolSecurityWrapper implements ToolPort {
  constructor(
    private readonly base: ToolPort,
    private readonly options: ToolSecurityOptions,
  ) {}

  getDescriptor(): ToolDescriptor {
    return this.base.getDescriptor();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const descriptor = this.base.getDescriptor();
    const toolName = descriptor.name;
    const ctx = this.options.resolveContext();
    const risk = this.options.resolveRiskLevel(toolName, descriptor.riskLevel);
    const argsHash = hashToolCall(toolName, args);

    const sandboxViolation = validateToolArgsSandbox(args, this.options.sandbox);
    if (sandboxViolation) {
      await this.audit("tool.denied", "denied", toolName, risk, ctx, {
        reason: "sandbox",
        violation: sandboxViolation.reason,
        field: sandboxViolation.field,
        argsHash,
      });
      return ToolResult.error(
        `Tool "${toolName}" rejected: ${sandboxViolation.reason}`,
        {
          failureDecision: "permissionDenied",
          permissionDenied: true,
          sandboxViolation: sandboxViolation.reason,
          riskLevel: risk,
        },
      );
    }

    if (risk === "irreversible" && this.options.irreversibleRequireHitl) {
      const userId = ctx.userId;
      const sessionId = ctx.sessionId;
      if (!userId || !sessionId) {
        await this.audit("tool.denied", "denied", toolName, risk, ctx, {
          reason: "missing_tenant_context",
          argsHash,
        });
        return ToolResult.error(
          `Tool "${toolName}" requires authenticated session context for irreversible approval.`,
          {
            failureDecision: "permissionDenied",
            permissionDenied: true,
            requiresHitl: true,
            riskLevel: risk,
          },
        );
      }

      const approved = this.options.approvalStore.isApproved({
        userId,
        sessionId,
        toolName,
        argsHash,
      });

      if (!approved) {
        let approvalId: string | undefined;
        if (this.options.onIrreversibleDenied) {
          approvalId = await this.options.onIrreversibleDenied({
            userId,
            sessionId,
            toolName,
            argsHash,
            argsSummary: summarizeArgs(args),
            executionId: ctx.executionId,
            traceId: ctx.traceId,
          });
        }

        await this.audit("tool.denied", "denied", toolName, risk, ctx, {
          reason: "irreversible_not_approved",
          argsHash,
          approvalId,
        });

        if (approvalId && ctx.executionId) {
          throw new ToolHitlRequiredError(toolName, approvalId, argsHash);
        }

        return ToolResult.error(
          `Tool "${toolName}" is irreversible and requires human approval before execution.`,
          {
            failureDecision: "permissionDenied",
            permissionDenied: true,
            requiresHitl: true,
            riskLevel: risk,
            argsHash,
            approvalId,
          },
        );
      }
    }

    try {
      const result = await this.base.execute(args);
      if (risk !== "read" && this.options.auditEnabled) {
        await this.audit(
          result.isError ? "tool.denied" : "tool.invoke",
          result.isError ? "error" : "success",
          toolName,
          risk,
          ctx,
          { argsHash, isError: result.isError },
        );
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (risk !== "read" && this.options.auditEnabled) {
        await this.audit("tool.denied", "error", toolName, risk, ctx, {
          argsHash,
          error: message,
        });
      }
      throw err;
    }
  }

  private async audit(
    action: "tool.invoke" | "tool.denied",
    outcome: "success" | "denied" | "error",
    toolName: string,
    risk: ToolRiskLevel,
    ctx: ToolSecurityContext,
    detail: Record<string, unknown>,
  ): Promise<void> {
    if (!this.options.auditEnabled || !this.options.auditStore || !ctx.userId) return;
    try {
      await this.options.auditStore.append({
        userId: ctx.userId,
        action,
        resourceType: "tool",
        resourceId: toolName,
        sessionId: ctx.sessionId,
        executionId: ctx.executionId,
        traceId: ctx.traceId,
        outcome,
        detail: { riskLevel: risk, ...detail },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    } catch {
      // Audit must not break tool execution.
    }
  }
}

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > 200) {
      out[key] = `${value.slice(0, 200)}…`;
    } else {
      out[key] = value;
    }
  }
  return out;
}
