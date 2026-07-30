import type {
  MessageQueuePort,
  QueueMessage,
  MessageHandler,
  MessageResult,
  PublishOptions,
  QueueStats,
} from "../../port/queue/MessageQueuePort.js";
import type { IdGeneratorPort } from "../../port/infra/IdGeneratorPort.js";
import { hostname } from "node:os";
import Redis from "ioredis";

type RedisArgument = string | number;
type StreamEntry = readonly [entryId: string, fields: Readonly<Record<string, string>>];

/** The smallest Redis command surface needed by this adapter. */
export interface RedisMessageQueueClient {
  connect(): Promise<unknown>;
  xgroup(...args: RedisArgument[]): Promise<unknown>;
  xadd(...args: RedisArgument[]): Promise<unknown>;
  xreadgroup(...args: RedisArgument[]): Promise<unknown>;
  xautoclaim(...args: RedisArgument[]): Promise<unknown>;
  xack(...args: RedisArgument[]): Promise<unknown>;
  xdel(key: string, ...ids: string[]): Promise<number>;
  xpending(...args: RedisArgument[]): Promise<unknown>;
  xlen(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
}

export type RedisMessageQueueClientFactory = (redisUrl: string) => RedisMessageQueueClient;

export interface RedisMessageQueueOptions {
  readonly consumerGroup?: string;
  readonly blockMs?: number;
  readonly visibilityTimeoutMs?: number;
  readonly maxRetries?: number;
  readonly keyPrefix?: string;
  readonly client?: RedisMessageQueueClient;
  readonly clientFactory?: RedisMessageQueueClientFactory;
}

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
  private readonly redis: RedisMessageQueueClient;
  private readonly handlers = new Map<string, MessageHandler>();
  private readonly consumerGroup: string;
  private readonly consumerName: string;
  private readonly blockMs: number;
  private readonly visibilityTimeoutMs: number;
  private readonly defaultMaxRetries: number;
  private readonly inFlight = new Set<string>();
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    redisUrl: string,
    private readonly idGen: IdGeneratorPort,
    opts: RedisMessageQueueOptions = {},
    private readonly keyPrefix: string = opts?.keyPrefix ?? "mq:",
  ) {
    this.consumerGroup = opts?.consumerGroup ?? "gd-workers";
    this.blockMs = Math.min(2_000, Math.max(1, Math.trunc(opts.blockMs ?? 1_000)));
    this.visibilityTimeoutMs = Math.max(1, Math.trunc(opts.visibilityTimeoutMs ?? 30_000));
    this.defaultMaxRetries = Math.max(0, Math.trunc(opts.maxRetries ?? 3));
    this.consumerName = `${hostname()}-${process.pid}-${this.idGen.randomUUID()}`;
    this.redis =
      opts.client ??
      opts.clientFactory?.(redisUrl) ??
      (new Redis.default(redisUrl, { lazyConnect: true }) as unknown as RedisMessageQueueClient);
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
      maxRetries: Math.max(0, Math.trunc(options?.maxRetries ?? this.defaultMaxRetries)),
      retryCount: 0,
      userId: options?.userId,
    };

    const streamKey = this.buildStreamKey(queue);
    await this.ensureConsumerGroup(streamKey);
    await this.appendMessage(streamKey, message);

    return message;
  }

  async subscribe<T>(queue: string, handler: MessageHandler<T>): Promise<void> {
    this.handlers.set(queue, handler as MessageHandler);

    const streamKey = this.buildStreamKey(queue);
    await this.ensureConsumerGroup(streamKey);
  }

  async unsubscribe(queue: string): Promise<void> {
    this.handlers.delete(queue);
  }

  async getStats(queue: string): Promise<QueueStats> {
    const streamKey = this.buildStreamKey(queue);
    const dlqKey = this.buildDlqKey(streamKey);
    const [streamLength, pending, failed] = await Promise.all([
      this.redis.xlen(streamKey).catch(() => 0),
      this.getPendingCount(streamKey),
      this.redis.xlen(dlqKey).catch(() => 0),
    ]);
    return {
      queueName: queue,
      pending: streamLength,
      active: pending,
      completed: 0,
      failed,
    };
  }

  async purge(queue: string): Promise<number> {
    const streamKey = this.buildStreamKey(queue);
    const dlqKey = this.buildDlqKey(streamKey);
    try {
      const [streamLength, dlqLength] = await Promise.all([
        this.redis.xlen(streamKey).catch(() => 0),
        this.redis.xlen(dlqKey).catch(() => 0),
      ]);
      await this.redis.del(streamKey, dlqKey);
      return streamLength + dlqLength;
    } catch {
      return 0;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (this.loopPromise) {
      await this.loopPromise;
    }
    this.running = true;
    this.loopPromise = this.consumeLoop().finally(() => {
      this.loopPromise = null;
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.loopPromise;
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

  private async consumeLoop(): Promise<void> {
    while (this.running) {
      const subscriptions = [...this.handlers.entries()];
      if (subscriptions.length === 0) {
        await this.pause(this.blockMs);
        continue;
      }

      try {
        let processed = false;
        for (const [queue, handler] of subscriptions) {
          if (!this.running) break;
          const streamKey = this.buildStreamKey(queue);
          const claimed = await this.claimIdleEntries(streamKey);
          for (const entry of claimed) {
            if (!this.running) break;
            processed = true;
            await this.processEntry(streamKey, handler, entry);
          }
        }

        if (!this.running) break;
        const current = [...this.handlers.entries()];
        if (current.length === 0) continue;
        const streamKeys = current.map(([queue]) => this.buildStreamKey(queue));
        const streams = await this.redis.xreadgroup(
          "GROUP",
          this.consumerGroup,
          this.consumerName,
          "COUNT",
          1,
          "BLOCK",
          this.blockMs,
          "STREAMS",
          ...streamKeys,
          ...streamKeys.map(() => ">"),
        );
        if (!this.running) break;

        const subscriptionsByStream = new Map(
          current.map(([queue, handler]) => [this.buildStreamKey(queue), handler] as const),
        );
        for (const [streamKey, entries] of this.parseReadGroupReply(streams)) {
          const handler = subscriptionsByStream.get(streamKey);
          if (!handler) continue;
          for (const entry of entries) {
            processed = true;
            await this.processEntry(streamKey, handler, entry);
          }
        }

        if (!processed) {
          await this.pause(Math.min(this.blockMs, 10));
        }
      } catch (error) {
        console.error("[RedisMessageQueue] Consumer loop error:", error);
        await this.pause(Math.min(this.blockMs, 100));
      }
    }
  }

  private async claimIdleEntries(streamKey: string): Promise<StreamEntry[]> {
    try {
      const reply = await this.redis.xautoclaim(
        streamKey,
        this.consumerGroup,
        this.consumerName,
        this.visibilityTimeoutMs,
        "0-0",
        "COUNT",
        1,
      );
      if (!Array.isArray(reply)) return [];
      return this.parseEntries(reply[1]);
    } catch (error) {
      console.error(`[RedisMessageQueue] Failed to reclaim pending entries from ${streamKey}:`, error);
      return [];
    }
  }

  private async processEntry(
    streamKey: string,
    handler: MessageHandler,
    [entryId, fields]: StreamEntry,
  ): Promise<void> {
    const inFlightKey = `${streamKey}:${entryId}`;
    if (this.inFlight.has(inFlightKey)) return;
    this.inFlight.add(inFlightKey);
    try {
      const data = fields.data;
      if (!data) {
        await this.moveRawToDlq(streamKey, entryId, "", "Message has no data field");
        return;
      }

      let message: QueueMessage;
      try {
        message = this.parseMessage(data);
      } catch (error) {
        await this.moveRawToDlq(streamKey, entryId, data, this.errorMessage(error));
        return;
      }

      let result: MessageResult;
      try {
        result = await handler(message);
      } catch (error) {
        await this.handleFailure(
          streamKey,
          entryId,
          message,
          this.errorMessage(error),
          true,
        );
        return;
      }

      if (result.success) {
        await this.ackAndDelete(streamKey, entryId);
        return;
      }

      await this.handleFailure(
        streamKey,
        entryId,
        message,
        result.error ?? "Handler reported failure",
        result.retry === true,
      );
    } finally {
      this.inFlight.delete(inFlightKey);
    }
  }

  private async handleFailure(
    streamKey: string,
    entryId: string,
    message: QueueMessage,
    error: string,
    transient: boolean,
  ): Promise<void> {
    if (!transient || message.retryCount >= message.maxRetries) {
      await this.moveToDlq(streamKey, entryId, message, error);
      return;
    }

    const retryMessage: QueueMessage = {
      ...message,
      retryCount: message.retryCount + 1,
    };
    await this.appendMessage(streamKey, retryMessage);
    await this.ackAndDelete(streamKey, entryId);
  }

  private async moveToDlq(
    streamKey: string,
    entryId: string,
    message: QueueMessage,
    error: string,
  ): Promise<void> {
    await this.redis.xadd(
      this.buildDlqKey(streamKey),
      "*",
      "data",
      JSON.stringify({
        message,
        error,
        failedAt: new Date().toISOString(),
      }),
    );
    await this.ackAndDelete(streamKey, entryId);
  }

  private async moveRawToDlq(
    streamKey: string,
    entryId: string,
    rawMessage: string,
    error: string,
  ): Promise<void> {
    await this.redis.xadd(
      this.buildDlqKey(streamKey),
      "*",
      "data",
      JSON.stringify({
        message: rawMessage,
        error,
        failedAt: new Date().toISOString(),
      }),
    );
    await this.ackAndDelete(streamKey, entryId);
  }

  private async ackAndDelete(streamKey: string, entryId: string): Promise<void> {
    await this.redis.xack(streamKey, this.consumerGroup, entryId);
    await this.redis.xdel(streamKey, entryId);
  }

  private async appendMessage(streamKey: string, message: QueueMessage): Promise<void> {
    await this.redis.xadd(
      streamKey,
      "*",
      "data",
      JSON.stringify(message),
      "priority",
      message.priority,
      "attempt",
      message.retryCount,
    );
  }

  private async ensureConsumerGroup(streamKey: string): Promise<void> {
    try {
      await this.redis.xgroup("CREATE", streamKey, this.consumerGroup, "0", "MKSTREAM");
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("BUSYGROUP"))) {
        throw error;
      }
    }
  }

  private async getPendingCount(streamKey: string): Promise<number> {
    try {
      const reply = await this.redis.xpending(streamKey, this.consumerGroup);
      if (!Array.isArray(reply)) return 0;
      return this.toNumber(reply[0]);
    } catch {
      return 0;
    }
  }

  private parseReadGroupReply(reply: unknown): Array<readonly [string, StreamEntry[]]> {
    if (!Array.isArray(reply)) return [];
    const streams: Array<readonly [string, StreamEntry[]]> = [];
    for (const stream of reply) {
      if (!Array.isArray(stream) || typeof stream[0] !== "string") continue;
      streams.push([stream[0], this.parseEntries(stream[1])]);
    }
    return streams;
  }

  private parseEntries(reply: unknown): StreamEntry[] {
    if (!Array.isArray(reply)) return [];
    const entries: StreamEntry[] = [];
    for (const entry of reply) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
      const fields = this.parseFields(entry[1]);
      entries.push([entry[0], fields]);
    }
    return entries;
  }

  private parseFields(value: unknown): Readonly<Record<string, string>> {
    if (Array.isArray(value)) {
      const fields: Record<string, string> = {};
      for (let index = 0; index + 1 < value.length; index += 2) {
        const key = value[index];
        const fieldValue = value[index + 1];
        if (typeof key === "string" && typeof fieldValue === "string") {
          fields[key] = fieldValue;
        }
      }
      return fields;
    }
    if (typeof value === "object" && value !== null) {
      const fields: Record<string, string> = {};
      for (const [key, fieldValue] of Object.entries(value)) {
        if (typeof fieldValue === "string") fields[key] = fieldValue;
      }
      return fields;
    }
    return {};
  }

  private parseMessage(data: string): QueueMessage {
    const parsed: unknown = JSON.parse(data);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof Reflect.get(parsed, "id") !== "string" ||
      typeof Reflect.get(parsed, "queue") !== "string" ||
      typeof Reflect.get(parsed, "createdAt") !== "string" ||
      typeof Reflect.get(parsed, "maxRetries") !== "number" ||
      typeof Reflect.get(parsed, "retryCount") !== "number" ||
      !["low", "normal", "high"].includes(String(Reflect.get(parsed, "priority")))
    ) {
      throw new Error("Invalid queue message envelope");
    }
    return parsed as QueueMessage;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private async pause(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private buildStreamKey(queue: string): string {
    return `${this.keyPrefix}${queue}`;
  }

  private buildDlqKey(streamKey: string): string {
    return `${streamKey}:dlq`;
  }
}
