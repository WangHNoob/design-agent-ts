import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { LoggerPort } from "../../port/infra/LoggerPort.js";
import { ConsoleLogger } from "../observability/ConsoleLogger.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import { hashToolCall } from "../guard/hash.js";

export interface ToolLoopDetectorHookOptions {
  /** Sliding window size (recent K tool calls). */
  windowSize: number;
  /** Abort when the same (tool, paramsHash) appears this many times in the window. */
  maxRepeats: number;
  tracer?: TracerPort;
  logger?: LoggerPort;
}

/**
 * Detects repeated identical tool calls within a sliding window and fail-loud aborts.
 */
export class ToolLoopDetectorHook implements AgentHook {
  priority = 20;

  private readonly recentByTrace = new Map<string, string[]>();

  private readonly logger: LoggerPort;

  constructor(private readonly options: ToolLoopDetectorHookOptions) {
    this.logger = options.logger ?? new ConsoleLogger();
  }

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (point !== "pre_tool_execution") return context;
    if (this.options.windowSize <= 0 || this.options.maxRepeats <= 0) return context;

    const toolName = context.toolName ?? "";
    if (!toolName) return context;

    const traceKey =
      this.options.tracer?.getCurrentTrace()?.traceId
      ?? `session:${context.sessionId ?? "unknown"}:agent:${context.agentName ?? "unknown"}`;

    const fingerprint = hashToolCall(toolName, context.toolArguments);
    const window = this.recentByTrace.get(traceKey) ?? [];
    window.push(fingerprint);
    while (window.length > this.options.windowSize) {
      window.shift();
    }
    this.recentByTrace.set(traceKey, window);

    const repeats = window.filter((h) => h === fingerprint).length;
    if (repeats >= this.options.maxRepeats) {
      const reason =
        `Tool loop detected: tool=${toolName} repeats=${repeats} ` +
        `window=${this.options.windowSize} maxRepeats=${this.options.maxRepeats} hash=${fingerprint}`;
      this.logger.warn(`[ToolLoopDetectorHook] ${reason}`);
      context.abort = true;
      context.abortReason = reason;
      context.metadata.toolLoopDetected = true;
      context.metadata.toolLoopHash = fingerprint;
      context.metadata.toolLoopRepeats = repeats;

      if (this.options.tracer?.getCurrentTrace()) {
        await this.options.tracer.recordSpan({
          name: "guard.tool_loop",
          status: "error",
          attributes: {
            reason,
            toolName,
            fingerprint,
            repeats,
            windowSize: this.options.windowSize,
            maxRepeats: this.options.maxRepeats,
            abortReason: reason,
          },
        });
      }
    }

    return context;
  }
}
