import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import { isSpanPhase, type SpanPhase } from "../../port/tracing/types.js";

/**
 * Records the nine ReAct phases as immutable spans under the active trace.
 * pre_agent_call opens a nested parent span; post_agent_call / on_error closes it.
 */
export interface TracingHookOptions {
  /** 单个长文本属性（工具入参/出参、LLM 思考/输出）的最大字符数，超出截断。 */
  maxAttrChars?: number;
}

const DEFAULT_MAX_ATTR_CHARS = 1500;
/** 提取核心后数组最多保留的条数（防止整表倾倒） */
const MAX_CORE_ARRAY_ITEMS = 15;
/** 工具出参预算倍率：核心内容值得比普通属性更大的空间 */
const TOOL_RESULT_BUDGET_MULTIPLIER = 4;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[+${value.length - max} chars]`;
}

/** 容忍前缀与双重编码的 JSON 解析：
 *  - 黑板缓存等包装器会在 JSON 前加 `[来自黑板缓存]` 标记行；
 *  - 工具框架可能把 JSON 字符串再 stringify 一次（内容为转义 JSON 的字符串）。
 */
function parseJsonWithPrefix(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    // 双重编码：解析结果是字符串，且内容本身是 JSON → 再解析一层
    if (typeof parsed === "string") {
      const inner = parsed.trim();
      if (inner.startsWith("{") || inner.startsWith("[")) {
        try {
          return JSON.parse(inner);
        } catch {
          return parsed;
        }
      }
    }
    return parsed;
  } catch {
    const brace = value.indexOf("{");
    if (brace > 0) {
      try {
        return JSON.parse(value.slice(brace));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 值级紧凑化：保持 JSON 结构完整可解析，仅截断长字符串与超量数组。 */
function compactValue(value: unknown, maxValue: number): unknown {
  if (typeof value === "string") return truncate(value, maxValue);
  if (Array.isArray(value)) {
    const sliced = value.slice(0, MAX_CORE_ARRAY_ITEMS);
    const out = sliced.map((v) => compactValue(v, maxValue));
    if (value.length > MAX_CORE_ARRAY_ITEMS) {
      out.push(`…[+${value.length - MAX_CORE_ARRAY_ITEMS} rows]`);
    }
    return out;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = compactValue(v, maxValue);
    }
    return out;
  }
  return value;
}

/**
 * knowledge-hub 工具返回 knowledge-envelope/v1 协议包（contract/release/
 * result/qualityFlags/trust/trace）。观测只关心核心内容：提取 result，
 * 附带 trust（可信度）与 qualityFlags（质量标记），丢弃协议噪音，
 * 并对值做结构保持的紧凑化（截断后仍是合法 JSON，便于观测台渲染）。
 */
function extractToolResult(value: string, max: number): string {
  const parsed = parseJsonWithPrefix(value);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const env = parsed as Record<string, unknown>;
    if (env.result !== undefined && typeof env.result === "object") {
      const maxValue = Math.max(Math.floor(max / 10), 40);
      const core: Record<string, unknown> = { result: compactValue(env.result, maxValue) };
      if (env.trust !== undefined) core.trust = compactValue(env.trust, maxValue);
      if (env.qualityFlags !== undefined) core.qualityFlags = env.qualityFlags;
      return truncate(JSON.stringify(core), max);
    }
  }
  return truncate(value, max);
}

export class TracingHook implements AgentHook {
  /** Run early so later hooks see abort decisions after span recording. */
  priority = 5;

  constructor(
    private readonly tracer: TracerPort,
    private readonly options: TracingHookOptions = {},
  ) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (!this.tracer.getCurrentTrace()) {
      return context;
    }

    const agentName = context.agentName ?? "unknown";

    if (point === "pre_agent_call") {
      const span = await this.tracer.startSpan(`agent.${agentName}`, {
        phase: "pre_agent_call",
        attributes: {
          agentName,
          sessionId: context.sessionId,
          hookPoint: point,
        },
      });
      await this.tracer.recordSpan({
        name: `${agentName}.pre_agent_call`,
        phase: "pre_agent_call",
        parentSpanId: span.spanId,
        attributes: this.attrs(context, point),
      });
      return context;
    }

    if (point === "post_agent_call") {
      await this.tracer.recordSpan({
        name: `${agentName}.post_agent_call`,
        phase: "post_agent_call",
        attributes: this.attrs(context, point),
      });
      await this.endOpenAgentSpan(agentName, "ok");
      return context;
    }

    if (point === "on_error") {
      await this.tracer.recordSpan({
        name: `${agentName}.on_error`,
        phase: "on_error",
        status: "error",
        attributes: this.attrs(context, point),
      });
      await this.endOpenAgentSpan(agentName, "error");
      return context;
    }

    if (isSpanPhase(point) || point === "on_iteration_budget") {
      await this.tracer.recordSpan({
        name: `${agentName}.${point}`,
        phase: isSpanPhase(point) ? (point as SpanPhase) : undefined,
        status: "ok",
        attributes: this.attrs(context, point),
      });
    }

    return context;
  }

  private async endOpenAgentSpan(agentName: string, status: "ok" | "error"): Promise<void> {
    const current = this.tracer.getCurrentSpan();
    if (current && current.name === `agent.${agentName}`) {
      await this.tracer.endSpan(current, status, { agentName });
    }
  }

  private attrs(context: HookContext, point: HookPoint): Record<string, unknown> {
    const max = this.options.maxAttrChars ?? DEFAULT_MAX_ATTR_CHARS;
    return {
      hookPoint: point,
      agentName: context.agentName,
      sessionId: context.sessionId,
      toolName: context.toolName,
      toolArguments: context.toolArguments ? truncate(JSON.stringify(context.toolArguments), max) : undefined,
      toolResult: context.toolResult
        ? extractToolResult(context.toolResult, max * TOOL_RESULT_BUDGET_MULTIPLIER)
        : undefined,
      llmReasoning: context.llmReasoning ? truncate(context.llmReasoning, max) : undefined,
      llmOutput: context.llmOutput ? truncate(context.llmOutput, max) : undefined,
      inputTokens: context.inputTokenCount,
      outputTokens: context.outputTokenCount,
      iteration: context.iteration,
      maxIterations: context.maxIterations,
      error: context.error?.message,
    };
  }
}
