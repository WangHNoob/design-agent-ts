import type {
  CompensateFailureQueuePort,
  CompensateFailureRecord,
} from "../../port/saga/CompensateFailureQueuePort.js";

export class InMemoryCompensateFailureQueue implements CompensateFailureQueuePort {
  readonly records: CompensateFailureRecord[] = [];

  async enqueue(record: CompensateFailureRecord): Promise<void> {
    this.records.push(record);
  }

  clear(): void {
    this.records.length = 0;
  }
}
