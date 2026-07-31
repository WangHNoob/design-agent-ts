import { describe, expect, test, vi } from "vitest";
import type { ChatModelPort } from "../../../src/port/model/ChatModelPort.js";
import type { ModelResponse } from "../../../src/port/model/ModelResponse.js";
import { ChatMessage } from "../../../src/port/message/ChatMessage.js";
import { TaskPlanner } from "../../../src/core/agent/director/TaskPlanner.js";
import { Router } from "../../../src/core/agent/director/Router.js";

function modelResponse(text: string): ModelResponse {
  return {
    message: ChatMessage.text("assistant", "model", text),
    inputTokenCount: 1,
    outputTokenCount: 1,
    finishReason: "stop",
  };
}

function mockModel(outputs: string[]): ChatModelPort {
  let i = 0;
  return {
    async generate() {
      const text = outputs[Math.min(i, outputs.length - 1)]!;
      i += 1;
      return modelResponse(text);
    },
    async *stream() {
      yield modelResponse(outputs[0] ?? "");
    },
    getModelName: () => "mock",
    getProvider: () => "mock",
    reconfigure: () => {},
  };
}

describe("TaskPlanner structured closed loop", () => {
  test("illegal JSON does not silently succeed with empty subTasks", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const planner = new TaskPlanner(mockModel(["not-json", "still-bad", "{bad"]));
    const plan = await planner.plan("设计战斗系统", "chief_designer", null);
    expect(plan.subTasks.length).toBeGreaterThan(0);
    expect(plan.fallback === true || plan.parseFallback === true).toBe(true);
    expect(plan.subTasks.some((t) => t.description.includes("设计战斗系统"))).toBe(true);
    warn.mockRestore();
  });

  test("valid JSON plan passes without fallback mark", async () => {
    const planner = new TaskPlanner(
      mockModel([
        JSON.stringify({
          planId: "p1",
          subTasks: [
            {
              id: "T1",
              domain: "combat_design",
              description: "设计技能",
              dependencies: [],
              priority: 1,
            },
          ],
        }),
      ]),
    );
    const plan = await planner.plan("设计技能", "chief_designer", null);
    expect(plan.fallback).toBeUndefined();
    expect(plan.parseFallback).toBeUndefined();
    expect(plan.subTasks).toHaveLength(1);
    expect(plan.subTasks[0]!.domain).toBe("combat_design");
  });
});

describe("Router structured closed loop", () => {
  test("parse failure degrades to deterministic domain→agent mapping", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const router = new Router(mockModel(["not-json", "[]", "nope"]));
    const decisions = await router.route(
      {
        planId: "p1",
        requirement: "req",
        subTasks: [
          {
            id: "T1",
            fragmentId: "T1",
            domain: "combat_design",
            description: "战斗设计",
            dependencies: [],
            priority: 1,
          },
        ],
      },
      "chief_designer",
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.agentName).toBe("CombatDesigner");
    expect(decisions[0]!.domain).toBe("combat_design");
    warn.mockRestore();
  });
});
