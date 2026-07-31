import { describe, expect, test } from "vitest";
import { InMemoryCostStore } from "../../../src/core/cost/InMemoryCostStore.js";

describe("InMemoryCostStore", () => {
  const idGen = { randomUUID: () => crypto.randomUUID() };

  test("records usage and aggregates by user and agent", async () => {
    const store = new InMemoryCostStore(idGen);
    await store.recordUsage({
      userId: "user-a",
      agentName: "CombatDesigner",
      modelName: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostMicros: 1000,
    });
    await store.recordUsage({
      userId: "user-a",
      agentName: "QAPlanner",
      modelName: "gpt-4o",
      inputTokens: 200,
      outputTokens: 100,
      estimatedCostMicros: 2000,
    });
    await store.recordUsage({
      userId: "user-b",
      agentName: "CombatDesigner",
      modelName: "gpt-4o",
      inputTokens: 300,
      outputTokens: 150,
      estimatedCostMicros: 5000,
    });

    const byAgent = await store.aggregate({
      groupBy: "agent",
      userId: "user-a",
    });
    expect(byAgent).toHaveLength(2);
    expect(byAgent.find((row) => row.key === "CombatDesigner")?.inputTokens).toBe(100);

    const top = await store.listTopSpenders({ limit: 2 });
    expect(top[0]?.key).toBe("user-b");
    expect(top[0]?.estimatedCostMicros).toBe(5000);
  });
});
