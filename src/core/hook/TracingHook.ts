import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import { isSpanPhase, type SpanPhase } from "../../port/tracing/types.js";

/**
 * Records the nine ReAct phases as immutable spans under the active trace.
 * pre_agent_call opens a nested parent span; post_agent_call / on_error closes it.
 */
export class TracingHook implements AgentHook {
  /** Run early so later hooks see abort decisions after span recording. */
  priority = 5;

  constructor(private readonly tracer: TracerPort) {}

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
    return {
      hookPoint: point,
      agentName: context.agentName,
      sessionId: context.sessionId,
      toolName: context.toolName,
      iteration: context.iteration,
      maxIterations: context.maxIterations,
      error: context.error?.message,
    };
  }
}
