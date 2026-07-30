export interface ExecutionEvent {
  readonly type: string;
  readonly data: unknown;
  readonly createdAt: string;
  /** Redis Stream entry id, for example `1722337200000-0`. */
  readonly cursor: string;
}

export type NewExecutionEvent = Omit<ExecutionEvent, "cursor">;

/**
 * Tenant-scoped, replayable execution event log.
 *
 * Every operation that touches tenant data requires an explicit user id.
 * Implementations must return events in ascending cursor order and treat
 * `afterCursor` as an exclusive lower bound.
 */
export interface ExecutionEventStore {
  append(
    userId: string,
    executionId: string,
    event: NewExecutionEvent,
  ): Promise<ExecutionEvent>;
  list(
    userId: string,
    executionId: string,
    afterCursor?: string,
    limit?: number,
  ): Promise<ExecutionEvent[]>;
  replay(
    userId: string,
    executionId: string,
    afterCursor?: string,
    limit?: number,
  ): Promise<ExecutionEvent[]>;
  subscribe(
    userId: string,
    executionId: string,
    afterCursor: string,
    signal?: AbortSignal,
  ): AsyncIterable<ExecutionEvent>;
  purge(userId: string, executionId: string): Promise<number>;
  health(userId: string): Promise<boolean>;
  close(): Promise<void>;
}
