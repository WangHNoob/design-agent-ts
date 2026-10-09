import { beforeEach, describe, expect, test } from "vitest";
import { useTaskStore } from "../../frontend/lib/stores/taskStore.js";
import { handleStreamEvent } from "../../frontend/lib/streamHandler.js";

const store = useTaskStore;

function seedTask(sessionId: string, executionId: string) {
  store.getState().createTask("design", "chief_designer", "req", sessionId);
  store.getState().updateTask(sessionId, { executionId });
}

describe("完成消息幂等去重", () => {
  beforeEach(() => {
    store.getState().removeTask("s1");
  });

  test("SSE complete 与轮询兜底重复追加同一 execution 的完成消息时只显示一份", () => {
    seedTask("s1", "exec-1");
    // 路径 1：SSE complete 处理器
    handleStreamEvent("s1", "complete", { output: "# 完成\n总结内容" }, store.getState());
    // 路径 2：轮询兜底 applyExecution（ConsolePage）——相同确定性 ID
    store.getState().appendMessage("s1", {
      id: `msg_final_exec-1`,
      type: "ai",
      content: "# 完成\n总结内容",
      timestamp: "12:00:00",
    });

    const messages = store.getState().getTask("s1")?.messages ?? [];
    expect(messages.filter((m) => m.content.includes("总结内容"))).toHaveLength(1);
  });

  test("不同 execution 的完成消息互不吞并", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "complete", { output: "第一轮完成" }, store.getState());
    store.getState().appendMessage("s1", {
      id: "msg_final_exec-2",
      type: "ai",
      content: "第二轮完成",
      timestamp: "12:01:00",
    });
    const messages = store.getState().getTask("s1")?.messages ?? [];
    expect(messages.filter((m) => m.type === "ai")).toHaveLength(2);
  });

  test("appendMessage 对相同 ID 的普通消息同样幂等（刷新回放场景）", () => {
    seedTask("s1", "exec-1");
    const msg = { id: "msg_fixed_1", type: "ai" as const, content: "hello", timestamp: "12:00:00" };
    store.getState().appendMessage("s1", msg);
    store.getState().appendMessage("s1", { ...msg, timestamp: "12:00:01" });
    expect(store.getState().getTask("s1")?.messages).toHaveLength(1);
  });
});
