import type { ToolPort } from "../../port/tool/ToolPort.js";
import type { ToolDescriptor } from "../../port/tool/ToolDescriptor.js";
import { ToolResult } from "../../port/tool/ToolResult.js";
import type { ToolFailureDecision, ToolFailurePolicy } from "../../port/tool/ToolFailurePolicy.js";
import {
  DEFAULT_EXTERNAL_TOOL_FAILURE_POLICY,
  DEFAULT_TOOL_FAILURE_POLICY,
} from "../../port/tool/ToolFailurePolicy.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";
import type { CircuitState } from "../resilience/CircuitBreaker.js";
import type { ToolCircuitRegistry } from "../resilience/ToolCircuitRegistry.js";
import { ToolFastFailError } from "./ToolFastFailError.js";

export interface ResilientToolOptions {
  /** Failure policy; defaults differ for external vs in-process tools. */
  policy?: ToolFailurePolicy;
  /** When true, enable circuit breaker (external / MCP tools). */
  external?: boolean;
  /** Shared per-name breakers for external tools. */
  circuitRegistry?: ToolCircuitRegistry;
  /** Per-call timeout for the underlying execute (ms). 0 disables. */
  timeoutMs?: number;
  /** Resolve degrade-to tools by name. */
  resolveTool?: (name: string) => ToolPort | undefined;
  /** Optional tracer for decision / circuit transition spans. */
  tracer?: TracerPort;
  /** Sleep override for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const UNAVAILABLE_PREFIX = "[tool_unavailable]";

/**
 * Applies the four failure decisions (Retry / ReturnToLLM / Degrade / FastFail)
 * and optional circuit breaking for external / MCP tools.
 *
 * Design: the framework only defines decision types — tools (or the composition
 * root) declare which path to take; this wrapper executes it faithfully.
 */
export class ResilientToolWrapper implements ToolPort {
  private readonly policy: ToolFailurePolicy;
  private readonly external: boolean;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly base: ToolPort,
    private readonly options: ResilientToolOptions = {},
  ) {
    this.external = options.external === true;
    this.policy =
      options.policy ??
      (this.external ? DEFAULT_EXTERNAL_TOOL_FAILURE_POLICY : DEFAULT_TOOL_FAILURE_POLICY);
    this.timeoutMs = options.timeoutMs ?? 0;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  getDescriptor(): ToolDescriptor {
    return this.base.getDescriptor();
  }

  getFailurePolicy(): ToolFailurePolicy {
    return this.base.getFailurePolicy?.() ?? this.policy;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    return this.executeInternal(args, 0);
  }

  private async executeInternal(
    args: Record<string, unknown>,
    degradeDepth: number,
  ): Promise<ToolResult> {
    const name = this.base.getDescriptor().name;
    const policy = this.getFailurePolicy();
    const breaker = this.external ? this.options.circuitRegistry?.get(name) : undefined;

    if (breaker && !breaker.allow()) {
      const state = breaker.getState();
      await this.recordDecision(name, "return_to_llm", {
        "tool.circuit_state": state,
        "tool.circuit_short_circuit": true,
      });
      return ToolResult.error(
        `${UNAVAILABLE_PREFIX} Tool "${name}" is temporarily unavailable (circuit ${state}). ` +
          `Do not retry this tool; use another approach or proceed without it.`,
        {
          failureDecision: "return_to_llm",
          circuitState: state,
          circuitShortCircuit: true,
          toolUnavailable: true,
        },
      );
    }

    const maxRetries = policy.onError === "retry" ? (policy.maxRetries ?? 0) : 0;
    let lastError = "";
    let attempts = 0;

    while (attempts <= maxRetries) {
      const stateBefore = breaker?.getState();
      try {
        const result = await this.invokeBase(args);
        if (!result.isError) {
          const prev = stateBefore;
          breaker?.recordSuccess();
          if (prev && prev !== "closed" && breaker) {
            await this.recordCircuitTransition(name, prev, breaker.getState());
          }
          return {
            ...result,
            metadata: {
              ...result.metadata,
              ...(attempts > 0 ? { failureDecision: "retry", retryAttempts: attempts } : {}),
            },
          };
        }
        lastError = result.output;
        breaker?.recordFailure();
        if (stateBefore && breaker) {
          const after = breaker.getState();
          if (after !== stateBefore) {
            await this.recordCircuitTransition(name, stateBefore, after);
          }
        }
      } catch (err) {
        if (err instanceof ToolFastFailError) throw err;
        lastError = err instanceof Error ? err.message : String(err);
        const prev = stateBefore;
        breaker?.recordFailure();
        if (prev && breaker) {
          const after = breaker.getState();
          if (after !== prev) {
            await this.recordCircuitTransition(name, prev, after);
          }
        }
      }

      if (policy.onError !== "retry" || attempts >= maxRetries) {
        break;
      }
      const backoff = (policy.retryBackoffMs ?? 200) * 2 ** attempts;
      attempts += 1;
      await this.recordDecision(name, "retry", {
        "tool.retry_attempt": attempts,
        "tool.retry_backoff_ms": backoff,
        "tool.last_error": lastError.slice(0, 500),
      });
      await this.sleep(backoff);
    }

    const decision: ToolFailureDecision =
      policy.onError === "retry"
        ? (policy.onRetryExhausted ?? "return_to_llm")
        : policy.onError;

    return this.applyTerminalDecision(name, policy, decision, lastError, args, degradeDepth, attempts);
  }

  private async applyTerminalDecision(
    name: string,
    policy: ToolFailurePolicy,
    decision: ToolFailureDecision,
    lastError: string,
    args: Record<string, unknown>,
    degradeDepth: number,
    retryAttempts: number,
  ): Promise<ToolResult> {
    await this.recordDecision(name, decision, {
      "tool.last_error": lastError.slice(0, 500),
      "tool.retry_attempts": retryAttempts,
      "tool.degrade_depth": degradeDepth,
    });

    switch (decision) {
      case "retry":
        return this.returnToLlm(name, lastError, retryAttempts);

      case "return_to_llm":
        return this.returnToLlm(name, lastError, retryAttempts);

      case "degrade": {
        const maxDepth = policy.maxDegradeDepth ?? 1;
        const target = policy.degradeTo;
        if (!target || degradeDepth >= maxDepth) {
          return this.returnToLlm(
            name,
            lastError || `Degrade unavailable for "${name}"`,
            retryAttempts,
            { degradeFailed: true },
          );
        }
        const fallback = this.options.resolveTool?.(target);
        if (!fallback) {
          return this.returnToLlm(
            name,
            `Degrade target "${target}" not found after "${name}" failed: ${lastError}`,
            retryAttempts,
            { degradeFailed: true },
          );
        }
        try {
          const result = await fallback.execute(args);
          if (result.isError) {
            return this.returnToLlm(
              name,
              `Primary "${name}" failed (${lastError}); degrade to "${target}" also failed: ${result.output}`,
              retryAttempts,
              { degradeFailed: true, degradeDepth: degradeDepth + 1 },
            );
          }
          return {
            ...result,
            metadata: {
              ...result.metadata,
              failureDecision: "degrade",
              degradedFrom: name,
              degradeDepth: degradeDepth + 1,
            },
          };
        } catch (err) {
          if (err instanceof ToolFastFailError) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          return this.returnToLlm(
            name,
            `Primary "${name}" failed (${lastError}); degrade to "${target}" threw: ${msg}`,
            retryAttempts,
            { degradeFailed: true },
          );
        }
      }

      case "fast_fail":
        throw new ToolFastFailError(name, lastError || "unrecoverable tool failure");

      default: {
        const _exhaustive: never = decision;
        return this.returnToLlm(name, String(_exhaustive), retryAttempts);
      }
    }
  }

  private returnToLlm(
    name: string,
    lastError: string,
    retryAttempts: number,
    extra: Record<string, unknown> = {},
  ): ToolResult {
    return ToolResult.error(
      `Tool "${name}" failed: ${lastError}. Consider another tool or proceed without this result.`,
      {
        failureDecision: "return_to_llm",
        retryAttempts,
        ...extra,
      },
    );
  }

  private async invokeBase(args: Record<string, unknown>): Promise<ToolResult> {
    if (this.timeoutMs <= 0) {
      return this.base.execute(args);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.base.execute(args),
        new Promise<ToolResult>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Tool timed out after ${this.timeoutMs}ms`)),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async recordDecision(
    toolName: string,
    decision: ToolFailureDecision,
    attributes: Record<string, unknown>,
  ): Promise<void> {
    const tracer = this.options.tracer;
    if (!tracer?.getCurrentTrace()) return;
    try {
      await tracer.recordSpan({
        name: `tool.resilience.${toolName}`,
        kind: "internal",
        status: decision === "fast_fail" ? "error" : "ok",
        attributes: {
          "tool.name": toolName,
          "tool.failure_decision": decision,
          ...attributes,
        },
      });
    } catch {
      // Tracing must never break tool execution.
    }
  }

  private async recordCircuitTransition(
    toolName: string,
    from: CircuitState,
    to: CircuitState,
  ): Promise<void> {
    const tracer = this.options.tracer;
    if (!tracer?.getCurrentTrace()) return;
    try {
      await tracer.recordSpan({
        name: `tool.circuit.${toolName}`,
        kind: "internal",
        status: to === "open" ? "error" : "ok",
        attributes: {
          "tool.name": toolName,
          "tool.circuit_from": from,
          "tool.circuit_to": to,
        },
      });
    } catch {
      // ignore
    }
  }
}
