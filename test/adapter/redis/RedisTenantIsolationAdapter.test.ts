import { describe, expect, test, vi } from "vitest";
import { RedisTenantIsolationAdapter } from "../../../src/adapter/redis/RedisTenantIsolationAdapter.js";
import type { UserPort } from "../../../src/port/user/UserPort.js";

describe("RedisTenantIsolationAdapter concurrency", () => {
  test("checks the limit and increments in one Lua evaluation", async () => {
    const evalScript = vi.fn(async () => [1, 2]);
    const adapter = new RedisTenantIsolationAdapter(
      "redis://localhost:6379",
      {} as UserPort,
    );
    (adapter as unknown as { redis: { eval: typeof evalScript } }).redis = {
      eval: evalScript,
    };

    await expect(adapter.acquireConcurrencySlot("user-a", 3)).resolves.toEqual({
      acquired: true,
      current: 2,
    });

    expect(evalScript).toHaveBeenCalledOnce();
    const [script, keyCount, key, limit] = evalScript.mock.calls[0]!;
    expect(script).toContain('redis.call("GET", KEYS[1])');
    expect(script).toContain('redis.call("INCR", KEYS[1])');
    expect(keyCount).toBe(1);
    expect(key).toBe("gd:tenant:user-a:concurrent");
    expect(limit).toBe("3");
  });
});
