import type { AgentHook } from "../../port/hook/AgentHook.js";
import type { HookContext } from "../../port/hook/HookContext.js";
import type { HookPoint } from "../../port/hook/HookPoint.js";
import type { RateLimitPort } from "../../port/cost/RateLimitPort.js";
import type { TracerPort } from "../../port/tracing/TracerPort.js";

export interface RateLimitHookOptions {
  enabled: boolean;
  rateLimit: RateLimitPort;
  /** Estimated tokens reserved before an LLM call when exact usage is unknown. */
  tpmEstimatePerCall: number;
  tracer?: TracerPort;
  resolveUserId?: () => string | undefined;
}

/**
 * Enforces per-user TPM quotas before/after model calls.
 * RPM is enforced at HTTP execution entry (RateLimitGuard).
 */
export class RateLimitHook implements AgentHook {
  priority = 13;

  constructor(private readonly options: RateLimitHookOptions) {}

  async onEvent(point: HookPoint, context: HookContext): Promise<HookContext> {
    if (!this.options.enabled) return context;

    const userId = this.resolveUserId(context);
    if (!userId) return context;

    if (point === "pre_reasoning") {
      const estimate =
        (typeof context.metadata.tpmEstimate === "number" ? context.metadata.tpmEstimate : undefined)
        ?? this.options.tpmEstimatePerCall;
      try {
        const result = await this.options.rateLimit.checkAndConsume({
          userId,
          tpmDelta: estimate,
          consume: false,
        });
        if (!result.allowed) {
          const code = result.code ?? "RATE_LIMIT_TPM";
          const reason = `${code}: tokens per minute limit exceeded`;
          context.abort = true;
          context.abortReason = reason;
          context.metadata.rateLimitCode = code;
          context.metadata.retryAfterMs = result.retryAfterMs;
          await this.safeRecordGuardSpan(reason, code, result.retryAfterMs);
        }
      } catch {
        const code = "RATE_LIMIT_TPM";
        const reason = `${code}: rate limit backend unavailable`;
        context.abort = true;
        context.abortReason = reason;
        context.metadata.rateLimitCode = code;
        await this.safeRecordGuardSpan(reason, code);
      }
      return context;
    }

    if (point === "post_reasoning") {
      const delta = (context.inputTokenCount ?? 0) + (context.outputTokenCount ?? 0);
      if (delta <= 0) return context;

      try {
        const result = await this.options.rateLimit.checkAndConsume({
          userId,
          tpmDelta: delta,
        });
        if (!result.allowed) {
          const code = result.code ?? "RATE_LIMIT_TPM";
          const reason = `${code}: tokens per minute limit exceeded after LLM call`;
          context.metadata.rateLimitCode = code;
          context.metadata.retryAfterMs = result.retryAfterMs;
          context.abort = true;
          context.abortReason = reason;
          await this.safeRecordGuardSpan(reason, code, result.retryAfterMs);
        }
      } catch {
        const code = "RATE_LIMIT_TPM";
        const reason = `${code}: rate limit backend unavailable`;
        context.metadata.rateLimitCode = code;
        context.abort = true;
        context.abortReason = reason;
        await this.safeRecordGuardSpan(reason, code);
      }
      return context;
    }

    return context;
  }

  private resolveUserId(context: HookContext): string | undefined {
    const trace = this.options.tracer?.getCurrentTrace();
    return (
      trace?.userId
      ?? this.options.resolveUserId?.()
      ?? (typeof context.metadata.userId === "string" ? context.metadata.userId : undefined)
    );
  }

  private async safeRecordGuardSpan(
    reason: string,
    code: string,
    retryAfterMs?: number,
  ): Promise<void> {
    try {
      const tracer = this.options.tracer;
      if (!tracer?.getCurrentTrace()) return;
      await tracer.recordSpan({
        name: "guard.rate_limit",
        status: "error",
        attributes: {
          reason,
          code,
          retryAfterMs,
          abortReason: reason,
        },
      });
    } catch (err) {
      console.warn("[RateLimitHook] Failed to record guard span:", err);
    }
  }
}
