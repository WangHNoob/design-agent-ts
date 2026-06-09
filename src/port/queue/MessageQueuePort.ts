/**
 * Message queue port — async task execution and event-driven communication.
 *
 * Used for:
 * - Decoupling long-running agent tasks from HTTP request lifecycle
 * - Concurrent execution control per user
 * - Event-driven notifications (task complete, HITL review needed, etc.)
 * - Reliable retry on failures
 */

/** Message priority levels. */
export type MessagePriority = "low" | "normal" | "high";

/** A message in the queue. */
export interface QueueMessage<T = unknown> {
  readonly id: string;
  readonly queue: string;
  readonly payload: T;
  readonly priority: MessagePriority;
  readonly createdAt: string;
  readonly scheduledAt?: string;
  readonly maxRetries: number;
  readonly retryCount: number;
  readonly userId?: string;
}

/** Handler for processing queue messages. */
export type MessageHandler<T = unknown> = (message: QueueMessage<T>) => Promise<MessageResult>;

/** Result of processing a message. */
export interface MessageResult {
  readonly success: boolean;
  readonly error?: string;
  /** Whether to retry the message on failure. */
  readonly retry?: boolean;
}

/** Options for publishing a message. */
export interface PublishOptions {
  readonly priority?: MessagePriority;
  readonly delayMs?: number;
  readonly maxRetries?: number;
  readonly userId?: string;
}

/** Queue statistics. */
export interface QueueStats {
  readonly queueName: string;
  readonly pending: number;
  readonly active: number;
  readonly completed: number;
  readonly failed: number;
}

/**
 * Port interface for message queue operations.
 *
 * Adapter implementations may use:
 * - Redis Streams (lightweight, single-process)
 * - RabbitMQ / Kafka (distributed, high-throughput)
 * - PostgreSQL SKIP LOCKED (simple, no extra infra)
 */
export interface MessageQueuePort {
  /** Publish a message to a queue. */
  publish<T>(queue: string, payload: T, options?: PublishOptions): Promise<QueueMessage<T>>;

  /** Subscribe a handler to a queue. Only one handler per queue is active at a time. */
  subscribe<T>(queue: string, handler: MessageHandler<T>): Promise<void>;

  /** Unsubscribe from a queue. */
  unsubscribe(queue: string): Promise<void>;

  /** Get statistics for a queue. */
  getStats(queue: string): Promise<QueueStats>;

  /** Purge all pending messages from a queue. */
  purge(queue: string): Promise<number>;

  /** Start processing messages (begins consuming from subscribed queues). */
  start(): Promise<void>;

  /** Stop processing messages gracefully. */
  stop(): Promise<void>;

  /** Health check. */
  healthCheck(): Promise<boolean>;
}
