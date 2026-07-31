import { describe, expect, test } from "vitest";
import { estimateCostMicros } from "../../../src/core/cost/estimateCost.js";

describe("estimateCostMicros", () => {
  test("computes blended input/output price in micro-USD", () => {
    const micros = estimateCostMicros(1_000_000, 500_000, "gpt-4o", {
      inputPricePer1M: 2.5,
      outputPricePer1M: 10,
    });
    expect(micros).toBe(7_500_000);
  });

  test("uses per-model override when configured", () => {
    const micros = estimateCostMicros(1_000_000, 0, "gpt-4o-mini", {
      inputPricePer1M: 2.5,
      outputPricePer1M: 10,
      modelPrices: {
        "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
      },
    });
    expect(micros).toBe(150_000);
  });
});
