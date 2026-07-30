import Redis from "ioredis";
import type {
  ExecutionEvent,
  ExecutionEventStore,
  NewExecutionEvent,
} from "../../port/execution/ExecutionEventStore.js";

type RedisArgument = string | number;
type RedisFields = Readonly<Record<string, string>>;
type RawStreamEntry = readonly [cursor: string, fields: RedisFields];

const CURSOR_PATTERN = /^\d+-\d+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const INITIAL_CURSOR = "0-0";

/** The minimum Redis command surface required by the event store. */
export interface RedisExecutionEventClient {
  connect(): Promise<unknown>;
  xadd(...args: RedisArgument[]): Promise<unknown>;
  xrange(...args: RedisArgument[]): Promise<unknown>;
  xrevrange(...args: RedisArgument[]): Promise<unknown>;
  xread(...args: RedisArgument[]): Promise<unknown>;
  xlen(key: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  ping(): Promise<unknown>;
  quit(): Promise<unknown>;
}

export type RedisExecutionEventClientFactory = (
  redisUrl: string,
) => RedisExecutionEventClient;

export interface RedisExecutionEventStoreOptions {
  readonly maxLength?: number;
  readonly blockMs?: number;
  readonly replayBatchSize?: number;
  readonly keyPrefix?: string;
  readonly client?: RedisExecutionEventClient;
  readonly clientFactory?: RedisExecutionEventClientFactory;
}

/**
 * Redis Streams implementation of the replayable execution event log.
 *
 * The writer never performs blocking reads. Each subscription owns a reader
 * connection that is closed when iteration ends. Subscription startup takes a
 * high-water-mark snapshot, replays through it, then tails from that exact
 * cursor so events appended during the transition cannot be lost.
 */
export class RedisExecutionEventStoreAdapter implements ExecutionEventStore {
  private readonly writer: RedisExecutionEventClient;
  private readonly readerFactory: RedisExecutionEventClientFactory;
  private readonly maxLength: number;
  private readonly blockMs: number;
  private readonly replayBatchSize: number;
  private readonly keyPrefix: string;
  private readonly activeReaders = new Set<RedisExecutionEventClient>();
  private readonly closedReaders = new WeakSet<object>();
  private closed = false;

  constructor(
    private readonly redisUrl: string,
    options: RedisExecutionEventStoreOptions = {},
  ) {
    const defaultFactory: RedisExecutionEventClientFactory = (url) =>
      new Redis.default(url, {
        lazyConnect: true,
      }) as unknown as RedisExecutionEventClient;
    this.readerFactory = options.clientFactory ?? defaultFactory;
    this.writer = options.client ?? this.readerFactory(redisUrl);
    this.maxLength = this.positiveInteger(options.maxLength, 10_000);
    this.blockMs = Math.min(
      2_000,
      this.positiveInteger(options.blockMs, 1_000),
    );
    this.replayBatchSize = Math.min(
      1_000,
      this.positiveInteger(options.replayBatchSize, 100),
    );
    this.keyPrefix = options.keyPrefix ?? "execution-events:";
  }

  async connect(): Promise<void> {
    this.assertOpen();
    await this.writer.connect();
  }

  async append(
    userId: string,
    executionId: string,
    event: NewExecutionEvent,
  ): Promise<ExecutionEvent> {
    this.assertOpen();
    const key = this.streamKey(userId, executionId);
    const type = this.requireEventType(event.type);
    const createdAt = this.requireCreatedAt(event.createdAt);
    const data = this.serializeData(event.data);
    const result = await this.writer.xadd(
      key,
      "MAXLEN",
      "~",
      this.maxLength,
      "*",
      "type",
      type,
      "data",
      data,
      "createdAt",
      createdAt,
    );
    const cursor = this.requireCursorResult(result, "XADD");
    return { type, data: event.data, createdAt, cursor };
  }

  async list(
    userId: string,
    executionId: string,
    afterCursor = INITIAL_CURSOR,
    limit = 100,
  ): Promise<ExecutionEvent[]> {
    this.assertOpen();
    const key = this.streamKey(userId, executionId);
    this.assertCursor(afterCursor);
    const count = Math.min(1_000, this.positiveInteger(limit, 100));
    const reply = await this.writer.xrange(
      key,
      `(${afterCursor}`,
      "+",
      "COUNT",
      count,
    );
    return this.parseEntries(reply)
      .map((entry) => this.parseEvent(entry))
      .filter((event): event is ExecutionEvent => event !== null);
  }

  async replay(
    userId: string,
    executionId: string,
    afterCursor = INITIAL_CURSOR,
    limit = 100,
  ): Promise<ExecutionEvent[]> {
    return this.list(userId, executionId, afterCursor, limit);
  }

  async *subscribe(
    userId: string,
    executionId: string,
    afterCursor: string,
    signal?: AbortSignal,
  ): AsyncIterable<ExecutionEvent> {
    this.assertOpen();
    const key = this.streamKey(userId, executionId);
    this.assertCursor(afterCursor);
    if (signal?.aborted) return;

    const reader = this.readerFactory(this.redisUrl);
    this.activeReaders.add(reader);
    try {
      await reader.connect();
      if (signal?.aborted || this.closed) return;

      const snapshotCursor = await this.latestCursor(reader, key);
      let currentCursor = afterCursor;

      if (this.compareCursors(snapshotCursor, afterCursor) > 0) {
        while (this.compareCursors(currentCursor, snapshotCursor) < 0) {
          if (signal?.aborted || this.closed) return;
          const reply = await reader.xrange(
            key,
            `(${currentCursor}`,
            snapshotCursor,
            "COUNT",
            this.replayBatchSize,
          );
          const entries = this.parseEntries(reply);
          if (entries.length === 0) {
            currentCursor = snapshotCursor;
            break;
          }

          for (const entry of entries) {
            this.assertAscendingCursor(currentCursor, entry[0], snapshotCursor);
            currentCursor = entry[0];
            const event = this.parseEvent(entry);
            if (event) yield event;
          }
        }
      } else {
        currentCursor = afterCursor;
      }

      while (!signal?.aborted && !this.closed) {
        let reply: unknown;
        try {
          reply = await reader.xread(
            "COUNT",
            this.replayBatchSize,
            "BLOCK",
            this.blockMs,
            "STREAMS",
            key,
            currentCursor,
          );
        } catch (error) {
          if (signal?.aborted || this.closed) return;
          throw error;
        }
        if (signal?.aborted || this.closed) return;

        for (const entry of this.parseReadReply(reply, key)) {
          const order = this.compareCursors(entry[0], currentCursor);
          if (order <= 0) continue;
          currentCursor = entry[0];
          const event = this.parseEvent(entry);
          if (event) yield event;
        }
      }
    } finally {
      this.activeReaders.delete(reader);
      await this.closeReader(reader);
    }
  }

  async purge(userId: string, executionId: string): Promise<number> {
    this.assertOpen();
    const key = this.streamKey(userId, executionId);
    const length = this.requireNonNegativeInteger(
      await this.writer.xlen(key),
      "XLEN",
    );
    await this.writer.del(key);
    return length;
  }

  async health(userId: string): Promise<boolean> {
    this.assertIdentifier(userId, "userId");
    if (this.closed) return false;
    try {
      return (await this.writer.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const readers = [...this.activeReaders];
    await Promise.all([
      ...readers.map((reader) => this.closeReader(reader)),
      this.writer.quit().then(() => undefined),
    ]);
  }

  private async latestCursor(
    reader: RedisExecutionEventClient,
    key: string,
  ): Promise<string> {
    const entries = this.parseEntries(
      await reader.xrevrange(key, "+", "-", "COUNT", 1),
    );
    return entries[0]?.[0] ?? INITIAL_CURSOR;
  }

  private parseReadReply(
    reply: unknown,
    expectedKey: string,
  ): RawStreamEntry[] {
    if (reply === null) return [];
    if (!Array.isArray(reply)) {
      throw new Error("Redis XREAD returned a non-array reply");
    }

    const entries: RawStreamEntry[] = [];
    for (const stream of reply) {
      if (
        !Array.isArray(stream) ||
        stream.length < 2 ||
        typeof stream[0] !== "string" ||
        stream[0] !== expectedKey
      ) {
        throw new Error("Redis XREAD returned an invalid stream envelope");
      }
      entries.push(...this.parseEntries(stream[1]));
    }
    return entries;
  }

  private parseEntries(reply: unknown): RawStreamEntry[] {
    if (!Array.isArray(reply)) {
      throw new Error("Redis stream command returned a non-array reply");
    }

    const entries: RawStreamEntry[] = [];
    for (const value of reply) {
      if (
        !Array.isArray(value) ||
        value.length < 2 ||
        typeof value[0] !== "string"
      ) {
        throw new Error("Redis stream command returned an invalid entry");
      }
      this.assertCursor(value[0]);
      entries.push([value[0], this.parseFields(value[1])]);
    }
    return entries;
  }

  private parseFields(value: unknown): RedisFields {
    const fields: Record<string, string> = {};
    if (Array.isArray(value)) {
      if (value.length % 2 !== 0) {
        throw new Error("Redis stream entry contains an odd field list");
      }
      for (let index = 0; index < value.length; index += 2) {
        const key = value[index];
        const fieldValue = value[index + 1];
        if (typeof key !== "string" || typeof fieldValue !== "string") {
          throw new Error("Redis stream entry contains a non-string field");
        }
        fields[key] = fieldValue;
      }
      return fields;
    }

    if (typeof value === "object" && value !== null) {
      for (const [key, fieldValue] of Object.entries(value)) {
        if (typeof fieldValue !== "string") {
          throw new Error("Redis stream entry contains a non-string field");
        }
        fields[key] = fieldValue;
      }
      return fields;
    }

    throw new Error("Redis stream entry has invalid fields");
  }

  private parseEvent([cursor, fields]: RawStreamEntry): ExecutionEvent | null {
    if (
      typeof fields.type !== "string" ||
      fields.type.length === 0 ||
      typeof fields.createdAt !== "string" ||
      !Number.isFinite(Date.parse(fields.createdAt)) ||
      typeof fields.data !== "string"
    ) {
      return null;
    }

    try {
      const data: unknown = JSON.parse(fields.data);
      return {
        type: fields.type,
        data,
        createdAt: fields.createdAt,
        cursor,
      };
    } catch {
      return null;
    }
  }

  private streamKey(userId: string, executionId: string): string {
    this.assertIdentifier(userId, "userId");
    this.assertIdentifier(executionId, "executionId");
    return `${this.keyPrefix}tenant:${userId}:execution:${executionId}`;
  }

  private assertIdentifier(value: string, name: string): void {
    if (!IDENTIFIER_PATTERN.test(value)) {
      throw new Error(`${name} must match ${IDENTIFIER_PATTERN.source}`);
    }
  }

  private assertCursor(cursor: string): void {
    if (!CURSOR_PATTERN.test(cursor)) {
      throw new Error(`Invalid Redis stream cursor: ${cursor}`);
    }
  }

  private requireCursorResult(value: unknown, command: string): string {
    if (typeof value !== "string" || !CURSOR_PATTERN.test(value)) {
      throw new Error(`Redis ${command} returned an invalid cursor`);
    }
    return value;
  }

  private assertAscendingCursor(
    previous: string,
    current: string,
    upperBound: string,
  ): void {
    if (
      this.compareCursors(current, previous) <= 0 ||
      this.compareCursors(current, upperBound) > 0
    ) {
      throw new Error("Redis XRANGE returned out-of-order entries");
    }
  }

  private compareCursors(left: string, right: string): number {
    const [leftTime, leftSequence] = left
      .split("-")
      .map((part) => BigInt(part));
    const [rightTime, rightSequence] = right
      .split("-")
      .map((part) => BigInt(part));
    if (leftTime! !== rightTime!) return leftTime! < rightTime! ? -1 : 1;
    if (leftSequence! === rightSequence!) return 0;
    return leftSequence! < rightSequence! ? -1 : 1;
  }

  private requireEventType(type: string): string {
    if (typeof type !== "string" || type.length === 0 || type.length > 128) {
      throw new Error("Execution event type must contain 1-128 characters");
    }
    return type;
  }

  private requireCreatedAt(createdAt: string): string {
    if (
      typeof createdAt !== "string" ||
      !Number.isFinite(Date.parse(createdAt))
    ) {
      throw new Error("Execution event createdAt must be a valid timestamp");
    }
    return createdAt;
  }

  private serializeData(data: unknown): string {
    const serialized = JSON.stringify(data);
    if (typeof serialized !== "string") {
      throw new Error("Execution event data must be JSON serializable");
    }
    return serialized;
  }

  private requireNonNegativeInteger(value: unknown, command: string): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new Error(`Redis ${command} returned an invalid count`);
    }
    return parsed;
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(
        "Redis execution event option must be a positive integer",
      );
    }
    return value;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("Redis execution event store is closed");
    }
  }

  private async closeReader(reader: RedisExecutionEventClient): Promise<void> {
    const identity = reader as object;
    if (this.closedReaders.has(identity)) return;
    this.closedReaders.add(identity);
    await reader.quit();
  }
}
