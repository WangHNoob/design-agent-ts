import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";

import { LangGraphSessionAdapter } from "../../../src/adapter/langgraph/LangGraphSessionAdapter.js";
import type { SessionKey } from "../../../src/port/session/SessionKey.js";

const TEST_DIR = "test-sessions-temp";

describe("LangGraphSessionAdapter", () => {
  let adapter: LangGraphSessionAdapter;

  beforeEach(() => {
    adapter = new LangGraphSessionAdapter(TEST_DIR);
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("应保存和加载状态", async () => {
    const key: SessionKey = { sessionId: "session-1", namespace: "test" };
    const state = { data: "hello", count: 42 };

    await adapter.save(key, state);
    const loaded = await adapter.load(key);

    expect(loaded).toEqual(state);
  });

  it("不存在的 session 应返回 null", async () => {
    const key: SessionKey = { sessionId: "non-existent" };
    const loaded = await adapter.load(key);
    expect(loaded).toBeNull();
  });

  it("exists 应正确判断 session 是否存在", async () => {
    const key: SessionKey = { sessionId: "session-2" };
    expect(await adapter.exists(key)).toBe(false);

    await adapter.save(key, { test: true });
    expect(await adapter.exists(key)).toBe(true);
  });

  it("delete 应删除 session", async () => {
    const key: SessionKey = { sessionId: "session-3" };
    await adapter.save(key, { test: true });
    expect(await adapter.exists(key)).toBe(true);

    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
  });
});
