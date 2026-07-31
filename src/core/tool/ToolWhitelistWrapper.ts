import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { CompensateHandler } from "../../port/tool/ToolCompensate.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import type { ToolFailurePolicy } from "../../port/tool/ToolFailurePolicy.js";
import { DEFAULT_TOOL_FAILURE_POLICY } from "../../port/tool/ToolFailurePolicy.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { ToolRegistry } from "../../port/tool/ToolRegistry.js";
import { PlanHardGuard } from "../plan/PlanHardGuard.js";
import { PlanViolationError } from "../plan/PlanViolationError.js";

export interface ToolWhitelistOptions {
  readonly taskId: string;
  readonly allowedTools: ReadonlySet<string> | readonly string[];
  /** When true (default), deny with ToolResult.error; when false, pass through. */
  readonly rejectUnauthorized: boolean;
  readonly onDenied?: (info: {
    taskId: string;
    toolName: string;
    reason: string;
  }) => void | Promise<void>;
}

/**
 * Defense-in-depth: wrap a tool so calls outside the step whitelist fail loud.
 * Prefer intersecting descriptor.toolNames first; this catches residual bypasses.
 */
export class ToolWhitelistWrapper implements ToolPort {
  private readonly allowed: ReadonlySet<string>;

  constructor(
    private readonly base: ToolPort,
    private readonly options: ToolWhitelistOptions,
  ) {
    this.allowed = options.allowedTools instanceof Set
      ? options.allowedTools
      : new Set(options.allowedTools);
  }

  getDescriptor(): ToolDescriptor {
    return this.base.getDescriptor();
  }

  getFailurePolicy(): ToolFailurePolicy {
    return this.base.getFailurePolicy?.() ?? DEFAULT_TOOL_FAILURE_POLICY;
  }

  getCompensateHandler?(): CompensateHandler | undefined {
    return this.base.getCompensateHandler?.();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const toolName = this.base.getDescriptor().name;
    if (!this.options.rejectUnauthorized) {
      return this.base.execute(args);
    }
    if (this.allowed.has(toolName)) {
      return this.base.execute(args);
    }

    const reason = this.allowed.size === 0
      ? "task whitelist is empty (no external tools allowed)"
      : `tool not in allowedTools=[${[...this.allowed].join(", ")}]`;

    await this.options.onDenied?.({
      taskId: this.options.taskId,
      toolName,
      reason,
    });

    // Fail loud for callers that check error type; also return ToolResult so
    // agent loops that swallow throws still see a clear denial.
    const violation = new PlanViolationError({
      taskId: this.options.taskId,
      toolName,
      code: "tool_denied",
      reason,
    });

    return ToolResult.error(violation.message, {
      failureDecision: "permissionDenied",
      permissionDenied: true,
      planViolation: true,
      code: "tool_denied",
      taskId: this.options.taskId,
      toolName,
      reason,
    });
  }
}

/**
 * Registry facade that wraps every resolved tool with {@link ToolWhitelistWrapper}.
 */
export class WhitelistToolRegistry implements ToolRegistry {
  private readonly allowed: ReadonlySet<string>;

  constructor(
    private readonly base: ToolRegistry,
    private readonly options: ToolWhitelistOptions,
  ) {
    this.allowed = options.allowedTools instanceof Set
      ? options.allowedTools
      : new Set(options.allowedTools);
  }

  register(tool: ToolPort): void {
    this.base.register(tool);
  }

  getToolDescriptors(): ToolDescriptor[] {
    // Hide tools outside the whitelist so the LLM cannot select them.
    return this.base.getToolDescriptors().filter((d) => this.allowed.has(d.name));
  }

  getTool(name: string): ToolPort | undefined {
    const tool = this.base.getTool(name);
    if (!tool) return undefined;
    return new ToolWhitelistWrapper(tool, {
      ...this.options,
      allowedTools: this.allowed,
    });
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.getTool(name);
    if (!tool) {
      // Still enforce deny semantics for missing-or-blocked names
      try {
        PlanHardGuard.assertToolAllowed(
          { id: this.options.taskId, domain: "system_design", allowedTools: [...this.allowed] },
          name,
        );
      } catch (err) {
        if (err instanceof PlanViolationError) {
          await this.options.onDenied?.({
            taskId: this.options.taskId,
            toolName: name,
            reason: err.reason,
          });
          return ToolResult.error(err.message, {
            failureDecision: "permissionDenied",
            permissionDenied: true,
            planViolation: true,
            code: "tool_denied",
          });
        }
      }
      return ToolResult.error(`Tool not found: ${name}`);
    }
    return tool.execute(args);
  }
}
