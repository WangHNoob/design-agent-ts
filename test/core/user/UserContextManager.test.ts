import { describe, expect, test, vi } from "vitest";
import { InMemoryTenantIsolationAdapter } from "../../../src/core/user/InMemoryTenantIsolationAdapter.js";
import { UserContextManager } from "../../../src/core/user/UserContextManager.js";
import type { TenantContext, TenantIsolationPort } from "../../../src/port/user/TenantIsolationPort.js";
import type { UserPort } from "../../../src/port/user/UserPort.js";

const ctx: TenantContext = {
  userId: "user-a",
  role: "user",
  sessionId: "auth-user-a",
};

describe("UserContextManager concurrency contract", () => {
  test("delegates acquisition to the single atomic port operation", async () => {
    const acquireConcurrencySlot = vi.fn(async () => ({ acquired: true, current: 1 }));
    const releaseConcurrencySlot = vi.fn(async () => 0);
    const manager = new UserContextManager(
      {} as UserPort,
      { acquireConcurrencySlot, releaseConcurrencySlot } as TenantIsolationPort,
    );

    await expect(manager.acquireConcurrencySlot(ctx, 3)).resolves.toBe(true);
    await manager.releaseConcurrencySlot(ctx);

    expect(acquireConcurrencySlot).toHaveBeenCalledOnce();
    expect(acquireConcurrencySlot).toHaveBeenCalledWith("user-a", 3);
    expect(releaseConcurrencySlot).toHaveBeenCalledWith("user-a");
  });

  test("the in-memory compatibility adapter also enforces the limit atomically", async () => {
    const adapter = new InMemoryTenantIsolationAdapter({} as UserPort);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => adapter.acquireConcurrencySlot("user-a", 3)),
    );

    expect(results.filter((result) => result.acquired)).toHaveLength(3);
    expect(results.filter((result) => !result.acquired)).toHaveLength(7);
    await expect(adapter.releaseConcurrencySlot("user-a")).resolves.toBe(2);
  });
});
