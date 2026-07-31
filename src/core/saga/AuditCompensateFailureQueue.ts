import type { AuditStorePort } from "../../port/audit/AuditStorePort.js";
import type {
  CompensateFailureQueuePort,
  CompensateFailureRecord,
} from "../../port/saga/CompensateFailureQueuePort.js";

export class AuditCompensateFailureQueue implements CompensateFailureQueuePort {
  constructor(
    private readonly auditStore: AuditStorePort,
    private readonly resolveUserId: () => string,
  ) {}

  async enqueue(record: CompensateFailureRecord): Promise<void> {
    await this.auditStore.append({
      userId: this.resolveUserId(),
      action: "saga.compensate_failed",
      outcome: "error",
      sessionId: record.sessionId,
      resourceType: "tool",
      resourceId: record.toolName,
      detail: {
        toolName: record.toolName,
        args: record.args,
        forwardOutput: record.forwardResult.output,
        compensateError: record.compensateError,
        reason: record.reason,
        agentName: record.agentName,
        createdAt: record.createdAt,
      },
    });
  }
}
