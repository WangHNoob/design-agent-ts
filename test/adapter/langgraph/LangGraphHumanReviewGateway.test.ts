import { describe, it, expect, vi } from "vitest";

vi.mock("@langchain/langgraph", () => ({
  interrupt: vi.fn((value) => value),
}));

import { interrupt } from "@langchain/langgraph";
import { LangGraphHumanReviewGateway } from "../../../src/adapter/langgraph/LangGraphHumanReviewGateway.js";

describe("LangGraphHumanReviewGateway", () => {
  it("reviewPoint 禁用时直接 approved", async () => {
    const gateway = new LangGraphHumanReviewGateway();
    gateway.configure({
      "hitl-1-task-plan": { enabled: false, timeout: 30000, autoContinueOnTimeout: true },
    });

    const result = await gateway.requestReview("sid", "hitl-1-task-plan", { plan: "test" });
    expect(result.decision).toBe("approved");
  });

  it("未配置的 reviewPoint 默认 disabled", async () => {
    const gateway = new LangGraphHumanReviewGateway();
    const result = await gateway.requestReview("sid", "unknown-point", { data: "test" });
    expect(result.decision).toBe("approved");
  });

  it("isEnabled 在有配置时返回 true", () => {
    const gateway = new LangGraphHumanReviewGateway();
    expect(gateway.isEnabled()).toBe(false);
    gateway.configure({ "point-1": { enabled: true, timeout: 30000, autoContinueOnTimeout: true } });
    expect(gateway.isEnabled()).toBe(true);
  });

  it("getMaxRevisionRounds 返回 3", () => {
    const gateway = new LangGraphHumanReviewGateway();
    expect(gateway.getMaxRevisionRounds()).toBe(3);
  });

  it("启用的 reviewPoint 应调用 interrupt", async () => {
    const gateway = new LangGraphHumanReviewGateway();
    gateway.configure({
      "hitl-1-task-plan": { enabled: true, timeout: 30000, autoContinueOnTimeout: true },
    });

    await gateway.requestReview("sid", "hitl-1-task-plan", { plan: "test" });
    expect(interrupt).toHaveBeenCalled();
  });
});
