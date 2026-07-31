import type { HITLFreshnessPort } from "../../port/hitl/HITLFreshnessPort.js";
import type {
  HITLCheckpoint,
  HITLRepository,
  HITLTimeoutScanPort,
} from "../../port/hitl/HITLRepository.js";
import type { HITLTimeoutPolicy } from "../../port/hitl/HITLTimeoutPolicy.js";
import { resolveTimeoutDecision } from "./HITLOps.js";
import { AlwaysFreshHITLCheck } from "./AlwaysFreshHITLCheck.js";

export type HITLRepositoryFactory = (userId: string) => HITLRepository;

export interface HITLTimeoutApplyDeps {
  repositoryFactory: HITLRepositoryFactory;
  /**
   * After auto_approve / auto_reject: resume or fail the execution.
   * Sweeper injects the same path as the review route.
   */
  onAutoDecision: (input: {
    checkpoint: HITLCheckpoint;
    action: "approve" | "reject";
  }) => Promise<void>;
  /** After expire: fail the execution (if any). */
  onExpired: (checkpoint: HITLCheckpoint) => Promise<void>;
  systemReviewerId?: string;
}

/**
 * Applies configured timeout policy to one overdue checkpoint via CAS.
 * Returns "applied" | "skipped" (lost the race / already claimed).
 */
export async function applyHITLTimeout(
  checkpoint: HITLCheckpoint,
  policy: HITLTimeoutPolicy,
  deps: HITLTimeoutApplyDeps,
): Promise<"applied" | "skipped"> {
  const repo = deps.repositoryFactory(checkpoint.userId);
  const decision = resolveTimeoutDecision(policy);
  const reviewerId = deps.systemReviewerId ?? "system:hitl-timeout";

  if (decision.kind === "escalate") {
    const updated = await repo.escalate(checkpoint.id, { comment: decision.comment });
    return updated ? "applied" : "skipped";
  }

  if (decision.kind === "expire") {
    const expired = await repo.expire(checkpoint.id, {
      comment: decision.comment,
      reviewerId,
    });
    if (!expired) return "skipped";
    await deps.onExpired(expired);
    return "applied";
  }

  // review (auto_approve / auto_reject)
  const action = decision.action!;
  const reviewed = await repo.review(checkpoint.id, {
    action,
    comment: decision.comment,
    reviewerId,
    fallback: decision.fallback,
  });
  if (!reviewed) return "skipped";
  await deps.onAutoDecision({ checkpoint: reviewed, action });
  return "applied";
}

export interface HITLTimeoutSweeperOptions {
  scan: HITLTimeoutScanPort;
  timeoutMs: number;
  policy: HITLTimeoutPolicy;
  applyDeps: HITLTimeoutApplyDeps;
  batchSize?: number;
  now?: () => number;
  onError?: (err: unknown, checkpointId?: string) => void;
}

/**
 * One sweep tick: find overdue pending checkpoints and apply timeout policy.
 */
export async function sweepHITLTimeouts(options: HITLTimeoutSweeperOptions): Promise<{
  scanned: number;
  applied: number;
  skipped: number;
}> {
  if (options.timeoutMs <= 0) {
    return { scanned: 0, applied: 0, skipped: 0 };
  }
  const now = options.now?.() ?? Date.now();
  const cutoff = new Date(now - options.timeoutMs).toISOString();
  const batch = options.batchSize ?? 50;
  const overdue = await options.scan.listPendingOlderThan(cutoff, batch);

  let applied = 0;
  let skipped = 0;
  for (const cp of overdue) {
    // escalate policy: only escalate waiting_review; already escalated stays
    if (options.policy === "escalate" && cp.status === "escalated") {
      skipped += 1;
      continue;
    }
    try {
      const result = await applyHITLTimeout(cp, options.policy, options.applyDeps);
      if (result === "applied") applied += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      options.onError?.(err, cp.id);
    }
  }
  return { scanned: overdue.length, applied, skipped };
}

export async function assertHITLFreshness(
  checkpoint: HITLCheckpoint,
  freshness: HITLFreshnessPort = new AlwaysFreshHITLCheck(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const result = await freshness.check(checkpoint);
  if (result.fresh) return { ok: true };
  return { ok: false, reason: result.reason ?? "Checkpoint state is stale" };
}
