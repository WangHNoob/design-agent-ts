import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import {
  invokeSubAgent,
  type AgentCallGuard,
  type CallContext,
} from "./AgentCallGuard.js";
import {
  isMultiAgentGuardError,
  type MultiAgentGuardError,
} from "./MultiAgentGuardError.js";

export const AGENT_INVOKE_TOOL_NAME = "invoke_agent";

export interface AgentInvokeToolOptions {
  guard: AgentCallGuard;
  /** Current agent CallContext (parent for the next enter). */
  getParent: () => CallContext;
  /**
   * Run the target agent under `callParent` (already entered by invokeSubAgent).
   * Must not call enter() again for `agentName`.
   */
  runNested: (input: {
    agentName: string;
    assignment: string;
    callParent: CallContext;
  }) => Promise<string>;
  /** When set, only these agent names may be invoked. */
  allowedAgentNames?: readonly string[];
  onGuardViolation?: (err: MultiAgentGuardError) => void | Promise<void>;
}

/**
 * Production Agent-as-Tool: invoke another specialist under the active CallContext.
 * Depth / cycle guards run via {@link invokeSubAgent} before nested execution.
 */
export class AgentInvokeTool implements ToolPort {
  constructor(private readonly options: AgentInvokeToolOptions) {}

  getDescriptor(): ToolDescriptor {
    return {
      name: AGENT_INVOKE_TOOL_NAME,
      description:
        "调用另一名专业子 Agent 协助完成子问题。参数: agentName (string, 如 CombatDesigner), assignment (string)",
      parameters: {
        agentName: {
          name: "agentName",
          type: "string",
          description: "目标子 Agent 名称（如 SystemDesigner、CombatDesigner）",
          required: true,
        },
        assignment: {
          name: "assignment",
          type: "string",
          description: "交给该子 Agent 的任务说明",
          required: true,
        },
      },
    };
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const agentName = String(args.agentName ?? "").trim();
    const assignment = String(args.assignment ?? "").trim();
    if (!agentName || !assignment) {
      return ToolResult.error("invoke_agent requires agentName and assignment");
    }

    const allowed = this.options.allowedAgentNames;
    if (allowed && allowed.length > 0 && !allowed.includes(agentName)) {
      return ToolResult.error(
        `invoke_agent: agent "${agentName}" is not in allowed list [${allowed.join(", ")}]`,
      );
    }

    const parent = this.options.getParent();
    try {
      const output = await invokeSubAgent(
        this.options.guard,
        parent,
        agentName,
        async (callParent) =>
          this.options.runNested({ agentName, assignment, callParent }),
      );
      return ToolResult.success(output || "(子 Agent 返回空内容)");
    } catch (err) {
      if (isMultiAgentGuardError(err)) {
        await this.options.onGuardViolation?.(err);
        // Fail loud — do not return soft ToolResult that the LLM can ignore.
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      return ToolResult.error(`invoke_agent failed: ${message}`);
    }
  }
}
