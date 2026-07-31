import { describe, expect, it } from "vitest";
import { InMemoryAuditStore } from "../../../src/core/audit/InMemoryAuditStore.js";

describe("InMemoryAuditStore", () => {
  const idGen = { randomUUID: () => crypto.randomUUID() };

  it("appends and lists entries scoped by userId", async () => {
    const store = new InMemoryAuditStore(idGen);
    await store.append({
      userId: "user-a",
      action: "config.change",
      outcome: "success",
      detail: { field: "modelName" },
    });
    await store.append({
      userId: "user-b",
      action: "tool.invoke",
      outcome: "success",
      resourceType: "tool",
      resourceId: "blackboard_write",
    });

    const aEntries = await store.listByUser("user-a");
    expect(aEntries).toHaveLength(1);
    expect(aEntries[0]?.action).toBe("config.change");

    const filtered = await store.listByUser("user-b", { action: "tool.invoke" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.resourceId).toBe("blackboard_write");
  });
});
