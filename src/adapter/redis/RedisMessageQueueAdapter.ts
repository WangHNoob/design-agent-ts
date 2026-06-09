import type {
  MessageQueuePort,
  QueueMessage,
  MessageHandler,
  MessageResult,
  PublishOptions,
  QueueStats,
  MessagePriority,
} from "../../port/queue/MessageQueuePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import Redis from "ioredis";
import type { Redis as RedisType } from "ioredis";

/**
 * Redis Streams-based message queue adapter.
 *
 * Uses Redis Streams (XADD/XREADGROUP) for reliable message delivery:
 * - Consumer groups for parallel processing
 * - Pending entries list (PEL) for at-least-once delivery
 * - XACK for confirming message processing
 *
 * Suitable for single-instance or small-cluster deployments.
 * For high-throughput distributed systems, swap to RabbitMQ/Kafka adapter.
 */
export class RedisMessageQueueAdapter implements MessageQueuePort {
  private redis: RedisType;
  private handlers = new Map<string, MessageHandler>();
  private consumerGroup: string;
  private running = false;
  private pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    redisUrl: string,
    private readonly idGen: IdGeneratorPort,
    opts?: { consumerGroup?: string; pollIntervalMs?: number; keyPrefix?: string },
    private readonly keyPrefix: string = opts?.keyPrefix ?? "mq:",
  ) {
    this.consumerGroup = opts?.consumerGroup ?? "gd-workers";
    this.pollIntervalMs = opts?.pollIntervalMs ?? 100;
    this.redis = new Redis.default(redisUrl, { lazyConnect: true });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async publish<T>(queue: string, payload: T, options?: PublishOptions): Promise<QueueMessage<T>> {
    const id = this.idGen.randomUUID();
    const now = new Date().toISOString();
    const message: QueueMessage<T> = {
      id,
      queue,
      payload,
      priority: options?.priority ?? "normal",
      createdAt: now,
      maxRetries: options?.maxRetries ?? 3,
      retryCount: 0,
      userId: options?.userId,
    };

    const streamKey = this.buildStreamKey(queue);

    // Ensure consumer group exists
    try {
      await this.redis.xgroup("CREATE", streamKey, this.consumerGroup, "0", "MKSTREAM");
    } catch (err: unknown) {
      // BUSYGROUP = group already exists, which is fine
      if (!(err instanceof Error && err.message.includes("BUSYGROUP"))) {
        throw err;
      }
    }

    // Add message to stream
    await this.redis.xadd(
      streamKey,
      options?.delayMs ? `${Date.now() + options.delayMs}-0` : "*",
      "data",
      JSON.stringify(message),
      "priority",
      message.priority,
    );

    return message;
  }

  async subscribe<T>(queue: string, handler: MessageHandler<T>): Promise<void> {
    this.handlers.set(queue, handler as MessageHandler);

    // Ensure consumer group exists
    const streamKey = this.buildStreamKey(queue);
    try {
      await this.redis.xgroup("CREATE", streamKey, this.consumerGroup, "0", "MKSTREAM");
    } catch (err: unknown) {
      if (!(err instanceof Error && err.message.includes("BUSYGROUP"))) {
        throw err;
      }
    }
  }

  async unsubscribe(queue: string): Promise<void> {
    this.handlers.delete(queue);
  }

  async getStats(queue: string): Promise<QueueStats> {
    const streamKey = this.buildStreamKey(queue);
    try {
      const info = await this.redis.xinfo("STREAM", streamKey);
      const groups = (await this.redis.xinfo("GROUPS", streamKey).catch(() => [])) as Array<Record<string, unknown>>;

      const pending = groups.find((g) => g.name === this.consumerGroup);
      return {
        queueName: queue,
        pending: (info as Record<string, unknown>)?.length as number ?? 0,
        active: (pending?.pending as number) ?? 0,
        completed: 0, // Redis Streams doesn't track completed count natively
        failed: 0,
      };
    } catch {
      return { queueName: queue, pending: 0, active: 0, completed: 0, failed: 0 };
    }
  }

  async purge(queue: string): Promise<number> {
    const streamKey = this.buildStreamKey(queue);
    try {
      const info = await this.redis.xlen(streamKey);
      await this.redis.del(streamKey);
      return info;
    } catch {
      return 0;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Start polling loop
    this.pollTimer = setInterval(() => this.pollAllQueues(), this.pollIntervalMs);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === "PONG";
    } catch {
      return false;
    }
  }

  /** Close the Redis connection. */
  async close(): Promise<void> {
    await this.stop();
    await this.redis.quit();
  }

  // ─── Private ─────────────────────────────────────────────────

  private async pollAllQueues(): Promise<void> {
    if (!this.running || this.handlers.size === 0) return;

    for (const [queue, handler] of this.handlers.entries()) {
      try {
        await this.processQueue(queue, handler);
      } catch (err) {
        console.error(`[RedisMessageQueue] Error processing queue ${queue}:`, err);
      }
    }
  }

  private async processQueue(queue: string, handler: MessageHandler): Promise<void> {
    const streamKey = this.buildStreamKey(queue);
    const consumerName = `consumer-${process.pid ?? "0"}`;

    // Read new messages from the consumer group
    const messages = await this.redis.xreadgroup(
      "GROUP",
      this.consumerGroup,
      consumerName,
      "COUNT",
      1,
      "BLOCK",
      0,
      "STREAMS",
      streamKey,
      ">", // Only new messages
    );

    if (!messages || messages.length === 0) return;

    for (const stream of messages) {
      if (!Array.isArray(stream)) continue;
      const entries = stream[1] as Array<[string, Record<string, string>]>;
      if (!entries) continue;

      for (const [msgId, fields] of entries) {
        const data = fields["data"];
        if (!data) continue;

        try {
          const message = JSON.parse(data) as QueueMessage;
          const result: MessageResult = await handler(message);

          if (result.success) {
            // Acknowledge the message
            await this.redis.xack(streamKey, this.consumerGroup, msgId);
          } else if (result.retry && message.retryCount < message.maxRetries) {
            // Retry: re-publish with incremented retry count
            const retryMessage = { ...message, retryCount: message.retryCount + 1 };
            await this.publish(queue, retryMessage.payload, {
              priority: message.priority as MessagePriority,
              maxRetries: message.maxRetries,
              userId: message.userId,
            });
            await this.redis.xack(streamKey, this.consumerGroup, msgId);
          } else {
            // Failed permanently — acknowledge to remove from PEL
            await this.redis.xack(streamKey, this.consumerGroup, msgId);
            console.error(`[RedisMessageQueue] Message ${message.id} failed permanently: ${result.error}`);
          }
        } catch (err) {
          console.error(`[RedisMessageQueue] Error handling message ${msgId}:`, err);
          // Don't ack — message stays in PEL for potential retry
        }
      }
    }
  }

  private buildStreamKey(queue: string): string {
    return `${this.keyPrefix}${queue}`;
  }
}
