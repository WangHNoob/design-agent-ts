import { describe, expect, it } from "vitest";
import { InMemoryToolApprovalStore } from "../../../src/core/tool/InMemoryToolApprovalStore.js";

describe("InMemoryToolApprovalStore", () => {
  it("requires exact argsHash match when request includes argsHash", () => {
    const store = new InMemoryToolApprovalStore();
    store.grant({
      userId: "u1",
      sessionId: "s1",
      toolName: "delete_item",
      approvalId: "cp-1",
    });

    expect(store.isApproved({
      userId: "u1",
      sessionId: "s1",
      toolName: "delete_item",
      argsHash: "hash-a",
    })).toBe(false);

    store.grant({
      userId: "u1",
      sessionId: "s1",
      toolName: "delete_item",
      argsHash: "hash-a",
      approvalId: "cp-2",
    });

    expect(store.isApproved({
      userId: "u1",
      sessionId: "s1",
      toolName: "delete_item",
      argsHash: "hash-a",
    })).toBe(true);

    expect(store.isApproved({
      userId: "u1",
      sessionId: "s1",
      toolName: "delete_item",
      argsHash: "hash-b",
    })).toBe(false);
  });
});
