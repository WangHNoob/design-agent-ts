import { describe, expect, test } from "vitest";
import {
  RedisMessageQueueAdapter,
  type RedisMessageQueueClient,
} from "../../../src/adapter/redis/RedisMessageQueueAdapter.js";
import type { QueueMessage } from "../../../src/port/queue/MessageQueuePort.js";

type RedisArgument = string | number;
type FakeEntry = [id: string, fields: string[]];
type PendingEntry = {
  entry: FakeEntry;
  consumer: string;
  idleMs: number;
};

class FakeRedisClient implements RedisMessageQueueClient {
  readonly streams = new Map<string, FakeEntry[]>();
  readonly pending = new Map<string, Map<string, PendingEntry>>();
  readonly readCalls: RedisArgument[][] = [];
  readonly claimCalls: RedisArgument[][] = [];
  readonly deleteCalls: string[][] = [];
  connectCalls = 0;
  quitCalls = 0;
  maxConcurrentReads = 0;

  private readonly nextIndexes = new Map<string, number>();
  private sequence = 0;
  private concurrentReads = 0;

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async xgroup(...args: RedisArgument[]): Promise<string> {
    const streamKey = String(args[1]);
    if (this.pending.has(streamKey)) {
      throw new Error("BUSYGROUP Consumer Group name already exists");
    }
    this.streams.set(streamKey, this.streams.get(streamKey) ?? []);
    this.pending.set(streamKey, new Map());
    this.nextIndexes.set(streamKey, 0);
    return "OK";
  }

  async xadd(...args: RedisArgument[]): Promise<string> {
    const streamKey = String(args[0]);
    const fields = args.slice(2).map(String);
    const id = `${++this.sequence}-0`;
    const entries = this.streams.get(streamKey) ?? [];
    entries.push([id, fields]);
    this.streams.set(streamKey, entries);
    return id;
  }

  async xreadgroup(...args: RedisArgument[]): Promise<unknown> {
    this.readCalls.push(args);
    this.concurrentReads += 1;
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.concurrentReads);
    try {
      const blockIndex = args.indexOf("BLOCK");
      const blockMs = Number(args[blockIndex + 1]);
      const streamsIndex = args.indexOf("STREAMS");
      const streamArgs = args.slice(streamsIndex + 1);
      const streamKeys = streamArgs.slice(0, streamArgs.length / 2).map(String);
      const consumer = String(args[2]);
      const result: Array<[string, FakeEntry[]]> = [];

      for (const streamKey of streamKeys) {
        const entries = this.streams.get(streamKey) ?? [];
        const nextIndex = this.nextIndexes.get(streamKey) ?? 0;
        const entry = entries[nextIndex];
        if (!entry) continue;
        this.nextIndexes.set(streamKey, nextIndex + 1);
        const pending = this.pending.get(streamKey) ?? new Map<string, PendingEntry>();
        pending.set(entry[0], { entry, consumer, idleMs: 0 });
        this.pending.set(streamKey, pending);
        result.push([streamKey, [entry]]);
      }

      if (result.length > 0) return result;
      await sleep(blockMs);
      return null;
    } finally {
      this.concurrentReads -= 1;
    }
  }

  async xautoclaim(...args: RedisArgument[]): Promise<unknown> {
    this.claimCalls.push(args);
    const streamKey = String(args[0]);
    const consumer = String(args[2]);
    const minIdleMs = Number(args[3]);
    const pending = this.pending.get(streamKey);
    if (!pending) return ["0-0", []];
    for (const item of pending.values()) {
      if (item.idleMs < minIdleMs) continue;
      item.consumer = consumer;
      item.idleMs = 0;
      return ["0-0", [item.entry]];
    }
    return ["0-0", []];
  }

  async xack(...args: RedisArgument[]): Promise<number> {
    const streamKey = String(args[0]);
    const entryId = String(args[2]);
    return this.pending.get(streamKey)?.delete(entryId) ? 1 : 0;
  }

  async xdel(key: string, ...ids: string[]): Promise<number> {
    const entries = this.streams.get(key) ?? [];
    const idSet = new Set(ids);
    const nextIndex = this.nextIndexes.get(key) ?? 0;
    const removedBeforeCursor = entries
      .slice(0, nextIndex)
      .filter(([id]) => idSet.has(id))
      .length;
    const remaining = entries.filter(([id]) => !idSet.has(id));
    this.streams.set(key, remaining);
    this.nextIndexes.set(key, Math.max(0, nextIndex - removedBeforeCursor));
    return entries.length - remaining.length;
  }

  async xpending(...args: RedisArgument[]): Promise<unknown> {
    const streamKey = String(args[0]);
    return [this.pending.get(streamKey)?.size ?? 0, null, null, []];
  }

  async xlen(key: string): Promise<number> {
    return this.streams.get(key)?.length ?? 0;
  }

  async del(...keys: string[]): Promise<number> {
    this.deleteCalls.push(keys);
    let deleted = 0;
    for (const key of keys) {
      if (this.streams.delete(key)) deleted += 1;
      this.pending.delete(key);
      this.nextIndexes.delete(key);
    }
    return deleted;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<void> {
    this.quitCalls += 1;
  }

  seedPending(streamKey: string, message: QueueMessage, idleMs: number): void {
    const id = `${++this.sequence}-0`;
    const entry: FakeEntry = [id, ["data", JSON.stringify(message)]];
    const entries = this.streams.get(streamKey) ?? [];
    entries.push(entry);
    this.streams.set(streamKey, entries);
    this.nextIndexes.set(streamKey, entries.length);
    const pending = this.pending.get(streamKey) ?? new Map<string, PendingEntry>();
    pending.set(id, { entry, consumer: "dead-consumer", idleMs });
    this.pending.set(streamKey, pending);
  }

  messages(streamKey: string): unknown[] {
    return (this.streams.get(streamKey) ?? []).map(([, fields]) => {
      const dataIndex = fields.indexOf("data");
      return JSON.parse(fields[dataIndex + 1]!);
    });
  }
}

function createAdapter(
  client: FakeRedisClient,
  options: { blockMs?: number; visibilityTimeoutMs?: number; maxRetries?: number } = {},
): RedisMessageQueueAdapter {
  return new RedisMessageQueueAdapter(
    "redis://unused",
    { randomUUID: () => "instance-id" },
    {
      client,
      blockMs: options.blockMs ?? 5,
      visibilityTimeoutMs: options.visibilityTimeoutMs ?? 10,
      maxRetries: options.maxRetries ?? 2,
    },
  );
}

async function waitFor(assertion: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!assertion()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for queue condition");
    }
    await sleep(2);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RedisMessageQueueAdapter", () => {
  test("preserves the logical id and retries 0 -> 1 -> max before DLQ", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client, { maxRetries: 2 });
    const attempts: Array<{ id: string; retryCount: number }> = [];

    await adapter.subscribe("jobs", async (message) => {
      attempts.push({ id: message.id, retryCount: message.retryCount });
      return { success: false, retry: true, error: `attempt-${message.retryCount}` };
    });
    const published = await adapter.publish("jobs", { task: "design" });
    await adapter.start();
    await waitFor(() => client.streams.get("mq:jobs:dlq")?.length === 1);
    await adapter.stop();

    expect(attempts).toEqual([
      { id: published.id, retryCount: 0 },
      { id: published.id, retryCount: 1 },
      { id: published.id, retryCount: 2 },
    ]);
    const dlq = client.messages("mq:jobs:dlq")[0] as {
      message: QueueMessage;
      error: string;
      failedAt: string;
    };
    expect(dlq.message.id).toBe(published.id);
    expect(dlq.message.retryCount).toBe(2);
    expect(dlq.error).toBe("attempt-2");
    expect(Date.parse(dlq.failedAt)).not.toBeNaN();
    expect(client.streams.get("mq:jobs")).toEqual([]);
  });

  test("treats handler throws as transient and eventually writes DLQ", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client, { maxRetries: 1 });
    const attempts: number[] = [];

    await adapter.subscribe("throws", async (message) => {
      attempts.push(message.retryCount);
      throw new Error("temporary outage");
    });
    await adapter.publish("throws", "payload");
    await adapter.start();
    await waitFor(() => client.streams.get("mq:throws:dlq")?.length === 1);
    await adapter.stop();

    expect(attempts).toEqual([0, 1]);
    const dlq = client.messages("mq:throws:dlq")[0] as { error: string };
    expect(dlq.error).toBe("temporary outage");
    expect(client.pending.get("mq:throws")?.size).toBe(0);
  });

  test("sends an explicitly non-retryable failure directly to DLQ", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client, { maxRetries: 5 });
    const attempts: number[] = [];

    await adapter.subscribe("terminal", async (message) => {
      attempts.push(message.retryCount);
      return { success: false, retry: false, error: "invalid payload" };
    });
    await adapter.publish("terminal", "payload");
    await adapter.start();
    await waitFor(() => client.streams.get("mq:terminal:dlq")?.length === 1);
    await adapter.stop();

    expect(attempts).toEqual([0]);
    const dlq = client.messages("mq:terminal:dlq")[0] as {
      message: QueueMessage;
      error: string;
    };
    expect(dlq.message.retryCount).toBe(0);
    expect(dlq.error).toBe("invalid payload");
  });

  test("recovers idle pending entries with XAUTOCLAIM before reading new messages", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client, { visibilityTimeoutMs: 25 });
    const recovered: string[] = [];

    await adapter.subscribe("recover", async (message) => {
      recovered.push(message.id);
      return { success: true };
    });
    client.seedPending(
      "mq:recover",
      {
        id: "logical-recovered",
        queue: "recover",
        payload: {},
        priority: "normal",
        createdAt: new Date().toISOString(),
        maxRetries: 2,
        retryCount: 0,
      },
      100,
    );

    await adapter.start();
    await waitFor(() => recovered.length === 1);
    await adapter.stop();

    expect(recovered).toEqual(["logical-recovered"]);
    expect(client.claimCalls[0]).toEqual([
      "mq:recover",
      "gd-workers",
      expect.stringContaining("-instance-id"),
      25,
      "0-0",
      "COUNT",
      1,
    ]);
    expect(client.pending.get("mq:recover")?.size).toBe(0);
    expect(client.streams.get("mq:recover")).toEqual([]);
  });

  test("uses one finite blocking read and stop waits for its exit", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client, { blockMs: 20 });
    await adapter.subscribe("idle", async () => ({ success: true }));

    await Promise.all([adapter.start(), adapter.start()]);
    await waitFor(() => client.readCalls.length > 0);
    const startedAt = Date.now();
    await Promise.all([adapter.stop(), adapter.stop()]);

    const firstRead = client.readCalls[0]!;
    expect(firstRead[firstRead.indexOf("BLOCK") + 1]).toBe(20);
    expect(firstRead[firstRead.indexOf("STREAMS") + 1]).toBe("mq:idle");
    expect(client.maxConcurrentReads).toBe(1);
    expect(Date.now() - startedAt).toBeLessThan(100);
  });

  test("reads all subscribed queues in one fair multi-stream call", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client);
    const handled: string[] = [];

    await adapter.subscribe("first", async () => {
      handled.push("first");
      return { success: true };
    });
    await adapter.subscribe("second", async () => {
      handled.push("second");
      return { success: true };
    });
    await adapter.publish("first", 1);
    await adapter.publish("second", 2);

    await adapter.start();
    await waitFor(() => handled.length === 2);
    await adapter.stop();

    expect(handled.sort()).toEqual(["first", "second"]);
    const read = client.readCalls[0]!;
    const streamsIndex = read.indexOf("STREAMS");
    expect(read.slice(streamsIndex + 1, streamsIndex + 3)).toEqual([
      "mq:first",
      "mq:second",
    ]);
  });

  test("can be restarted while start and stop remain idempotent", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client);
    await adapter.subscribe("restart", async () => ({ success: true }));

    await Promise.all([adapter.start(), adapter.start()]);
    await waitFor(() => client.readCalls.length >= 1);
    await Promise.all([adapter.stop(), adapter.stop()]);
    const readsAfterFirstStop = client.readCalls.length;

    await adapter.start();
    await waitFor(() => client.readCalls.length > readsAfterFirstStop);
    await adapter.stop();

    expect(client.maxConcurrentReads).toBe(1);
  });

  test("purges both the main stream and DLQ and reports their message count", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client);
    await adapter.publish("purge", { live: true });
    await client.xadd("mq:purge:dlq", "*", "data", JSON.stringify({ failed: true }));

    await expect(adapter.purge("purge")).resolves.toBe(2);
    expect(client.deleteCalls).toContainEqual(["mq:purge", "mq:purge:dlq"]);
    await expect(client.xlen("mq:purge")).resolves.toBe(0);
    await expect(client.xlen("mq:purge:dlq")).resolves.toBe(0);
  });

  test("reports stream length, PEL size, and DLQ failures from Redis", async () => {
    const client = new FakeRedisClient();
    const adapter = createAdapter(client);
    await adapter.subscribe("stats", async () => ({ success: true }));
    await adapter.publish("stats", "pending");
    client.seedPending(
      "mq:stats",
      {
        id: "pending-id",
        queue: "stats",
        payload: {},
        priority: "normal",
        createdAt: new Date().toISOString(),
        maxRetries: 1,
        retryCount: 0,
      },
      0,
    );
    await client.xadd("mq:stats:dlq", "*", "data", JSON.stringify({ failed: true }));

    await expect(adapter.getStats("stats")).resolves.toEqual({
      queueName: "stats",
      pending: 2,
      active: 1,
      completed: 0,
      failed: 1,
    });
  });
});
