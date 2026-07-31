import { describe, expect, test } from "vitest";
import {
  RedisExecutionEventStoreAdapter,
  type RedisExecutionEventClient,
} from "../../../src/adapter/redis/RedisExecutionEventStoreAdapter.js";
import type { NewExecutionEvent } from "../../../src/port/execution/ExecutionEventStore.js";

type RedisArgument = string | number;
type FakeEntry = [cursor: string, fields: string[]];

class FakeRedisBackend {
  readonly streams = new Map<string, FakeEntry[]>();
  readonly xaddCalls: RedisArgument[][] = [];
  sequence = 0;
  onNextRange: (() => void) | undefined;

  appendRaw(key: string, fields: string[]): string {
    const cursor = `${++this.sequence}-0`;
    const entries = this.streams.get(key) ?? [];
    entries.push([cursor, fields]);
    this.streams.set(key, entries);
    return cursor;
  }
}

class FakeRedisClient implements RedisExecutionEventClient {
  readonly readCalls: RedisArgument[][] = [];
  connectCalls = 0;
  quitCalls = 0;

  constructor(readonly backend: FakeRedisBackend) {}

  async connect(): Promise<void> {
    this.connectCalls += 1;
  }

  async xadd(...args: RedisArgument[]): Promise<string> {
    this.backend.xaddCalls.push(args);
    const key = String(args[0]);
    const maxLength = Number(args[3]);
    const starIndex = args.indexOf("*");
    const fields = args.slice(starIndex + 1).map(String);
    const cursor = this.backend.appendRaw(key, fields);
    const entries = this.backend.streams.get(key)!;
    if (entries.length > maxLength) {
      entries.splice(0, entries.length - maxLength);
    }
    return cursor;
  }

  async xrange(...args: RedisArgument[]): Promise<FakeEntry[]> {
    const key = String(args[0]);
    const start = String(args[1]);
    const end = String(args[2]);
    const countIndex = args.indexOf("COUNT");
    const count =
      countIndex >= 0 ? Number(args[countIndex + 1]) : Number.MAX_SAFE_INTEGER;
    const onRange = this.backend.onNextRange;
    this.backend.onNextRange = undefined;
    onRange?.();
    return (this.backend.streams.get(key) ?? [])
      .filter(([cursor]) => {
        const afterStart = start.startsWith("(")
          ? compareCursors(cursor, start.slice(1)) > 0
          : compareCursors(cursor, start) >= 0;
        const beforeEnd = end === "+" || compareCursors(cursor, end) <= 0;
        return afterStart && beforeEnd;
      })
      .slice(0, count);
  }

  async xrevrange(...args: RedisArgument[]): Promise<FakeEntry[]> {
    const key = String(args[0]);
    return (this.backend.streams.get(key) ?? []).slice(-1).reverse();
  }

  async xread(...args: RedisArgument[]): Promise<unknown> {
    this.readCalls.push(args);
    const streamsIndex = args.indexOf("STREAMS");
    const key = String(args[streamsIndex + 1]);
    const cursor = String(args[streamsIndex + 2]);
    const countIndex = args.indexOf("COUNT");
    const count = Number(args[countIndex + 1]);
    const available = (this.backend.streams.get(key) ?? [])
      .filter(([entryCursor]) => compareCursors(entryCursor, cursor) > 0)
      .slice(0, count);
    if (available.length > 0) return [[key, available]];

    const blockIndex = args.indexOf("BLOCK");
    await sleep(Number(args[blockIndex + 1]));
    return null;
  }

  async xlen(key: string): Promise<number> {
    return this.backend.streams.get(key)?.length ?? 0;
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.backend.streams.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<void> {
    this.quitCalls += 1;
  }
}

function compareCursors(left: string, right: string): number {
  const [leftTime, leftSequence] = left.split("-").map((part) => BigInt(part));
  const [rightTime, rightSequence] = right
    .split("-")
    .map((part) => BigInt(part));
  if (leftTime! !== rightTime!) return leftTime! < rightTime! ? -1 : 1;
  if (leftSequence! === rightSequence!) return 0;
  return leftSequence! < rightSequence! ? -1 : 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function event(type: string, data: unknown = {}): NewExecutionEvent {
  return {
    type,
    data,
    createdAt: "2026-07-30T05:00:00.000Z",
  };
}

function createHarness(options: { maxLength?: number; blockMs?: number } = {}) {
  const backend = new FakeRedisBackend();
  const writer = new FakeRedisClient(backend);
  const readers: FakeRedisClient[] = [];
  const adapter = new RedisExecutionEventStoreAdapter("redis://unused", {
    client: writer,
    clientFactory: () => {
      const reader = new FakeRedisClient(backend);
      readers.push(reader);
      return reader;
    },
    maxLength: options.maxLength,
    blockMs: options.blockMs ?? 5,
    replayBatchSize: 2,
  });
  return { adapter, backend, writer, readers };
}

describe("RedisExecutionEventStoreAdapter", () => {
  test("isolates tenant/execution keys and appends with configurable MAXLEN", async () => {
    const { adapter, backend } = createHarness({ maxLength: 2 });

    await adapter.append("user-a", "execution-1", event("plan"));
    await adapter.append("user-a", "execution-1", event("route"));
    await adapter.append("user-a", "execution-1", event("complete"));
    await adapter.append("user-b", "execution-1", event("other-tenant"));

    const tenantAKey = "execution-events:tenant:user-a:execution:execution-1";
    const tenantBKey = "execution-events:tenant:user-b:execution:execution-1";
    expect([...backend.streams.keys()].sort()).toEqual([
      tenantAKey,
      tenantBKey,
    ]);
    expect(backend.streams.get(tenantAKey)).toHaveLength(2);
    expect(backend.xaddCalls[0]?.slice(0, 5)).toEqual([
      tenantAKey,
      "MAXLEN",
      "~",
      2,
      "*",
    ]);
  });

  test("lists and replays strictly after the supplied cursor", async () => {
    const { adapter } = createHarness();
    const first = await adapter.append(
      "user-a",
      "execution-1",
      event("first", 1),
    );
    const second = await adapter.append(
      "user-a",
      "execution-1",
      event("second", 2),
    );
    await adapter.append("user-a", "execution-1", event("third", 3));

    await expect(
      adapter.list("user-a", "execution-1", first.cursor, 1),
    ).resolves.toEqual([second]);
    await expect(
      adapter.replay("user-a", "execution-1", second.cursor, 10),
    ).resolves.toMatchObject([{ type: "third", data: 3 }]);
  });

  test("replays to a high-water mark then tails without loss or duplicates", async () => {
    const { adapter, backend, readers } = createHarness();
    const replayed = await adapter.append(
      "user-a",
      "execution-1",
      event("replayed"),
    );
    let tailedCursor = "";
    backend.onNextRange = () => {
      tailedCursor = backend.appendRaw(
        "execution-events:tenant:user-a:execution:execution-1",
        [
          "type",
          "tailed",
          "data",
          JSON.stringify({ during: "transition" }),
          "createdAt",
          "2026-07-30T05:00:01.000Z",
        ],
      );
    };

    const subscription = adapter.subscribe("user-a", "execution-1", "0-0");
    const iterator = subscription[Symbol.asyncIterator]();
    const first = await iterator.next();
    const second = await iterator.next();
    await iterator.return?.();

    expect([first.value?.cursor, second.value?.cursor]).toEqual([
      replayed.cursor,
      tailedCursor,
    ]);
    expect([first.value?.type, second.value?.type]).toEqual([
      "replayed",
      "tailed",
    ]);
    expect(new Set([first.value?.cursor, second.value?.cursor]).size).toBe(2);
    expect(readers).toHaveLength(1);
    expect(readers[0]?.connectCalls).toBe(1);
    expect(readers[0]?.quitCalls).toBe(1);
  });

  test("uses a dedicated finite-block reader and aborts within one cycle", async () => {
    const { adapter, writer, readers } = createHarness({ blockMs: 10 });
    const controller = new AbortController();
    const subscription = adapter.subscribe(
      "user-a",
      "execution-1",
      "0-0",
      controller.signal,
    );
    const iterator = subscription[Symbol.asyncIterator]();

    const pending = iterator.next();
    await waitFor(() => (readers[0]?.readCalls.length ?? 0) > 0);
    controller.abort();
    await expect(pending).resolves.toEqual({ done: true, value: undefined });

    const read = readers[0]!.readCalls[0]!;
    expect(read[read.indexOf("BLOCK") + 1]).toBe(10);
    expect(readers[0]?.quitCalls).toBe(1);
    expect(writer.readCalls).toHaveLength(0);
    expect(writer.quitCalls).toBe(0);
  });

  test("clamps blocking reads to 2000ms", async () => {
    const { adapter, readers } = createHarness({ blockMs: 5_000 });
    const controller = new AbortController();
    const subscription = adapter.subscribe(
      "user-a",
      "execution-1",
      "0-0",
      controller.signal,
    );
    const iterator = subscription[Symbol.asyncIterator]();
    const pending = iterator.next();
    await waitFor(() => (readers[0]?.readCalls.length ?? 0) > 0);
    controller.abort();
    expect(readers[0]!.readCalls[0]![3]).toBe(2_000);
    await adapter.close();
    await pending;
  });

  test("rejects unsafe ids/cursors and skips invalid stored events", async () => {
    const { adapter, backend } = createHarness();
    await expect(
      adapter.append("user:a", "execution-1", event("unsafe")),
    ).rejects.toThrow("userId");
    await expect(
      adapter.append("user-a", "../execution", event("unsafe")),
    ).rejects.toThrow("executionId");
    await expect(
      adapter.list("user-a", "execution-1", "0-0 COUNT 100"),
    ).rejects.toThrow("Invalid Redis stream cursor");

    const subscription = adapter.subscribe("user-a", "execution-1", "$");
    const iterator = subscription[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow(
      "Invalid Redis stream cursor",
    );

    backend.appendRaw("execution-events:tenant:user-a:execution:execution-1", [
      "type",
      "bad",
      "data",
      "{",
      "createdAt",
      "not-a-date",
    ]);
    await adapter.append("user-a", "execution-1", event("valid"));
    await expect(adapter.list("user-a", "execution-1")).resolves.toMatchObject([
      { type: "valid" },
    ]);
  });

  test("purges only the requested tenant execution and closes the writer", async () => {
    const { adapter, backend, writer } = createHarness();
    await adapter.append("user-a", "execution-1", event("one"));
    await adapter.append("user-a", "execution-1", event("two"));
    await adapter.append("user-a", "execution-2", event("keep"));

    await expect(adapter.purge("user-a", "execution-1")).resolves.toBe(2);
    expect(
      backend.streams.has(
        "execution-events:tenant:user-a:execution:execution-1",
      ),
    ).toBe(false);
    expect(
      backend.streams.has(
        "execution-events:tenant:user-a:execution:execution-2",
      ),
    ).toBe(true);
    await expect(adapter.health("user-a")).resolves.toBe(true);

    await adapter.close();
    expect(writer.quitCalls).toBe(1);
    await expect(adapter.health("user-a")).resolves.toBe(false);
  });
});

async function waitFor(
  assertion: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!assertion()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for Redis fake");
    }
    await sleep(2);
  }
}
