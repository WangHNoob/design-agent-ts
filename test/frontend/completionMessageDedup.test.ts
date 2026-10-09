import { beforeEach, describe, expect, test } from "vitest";
import { useTaskStore } from "../../frontend/lib/stores/taskStore.js";
import { handleStreamEvent, resetTaskTracking } from "../../frontend/lib/streamHandler.js";

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

  test("步骤时间线：同一任务的重复 task_start（HITL 周期/回放）只保留一行", () => {
    seedTask("s1", "exec-1");
    const startEvent = { taskId: "F3", description: "数值规划", domain: "numerical_planning" };
    handleStreamEvent("s1", "task_start", startEvent, store.getState());
    handleStreamEvent("s1", "task_start", startEvent, store.getState());
    handleStreamEvent("s1", "task_start", startEvent, store.getState());

    const taskRows = (store.getState().getTask("s1")?.timeline ?? []).filter((e) => e.type === "task");
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0].status).toBe("running");

    // 完成后再重跑（真实重跑场景）：仍是同一行，回到进行中→完成
    handleStreamEvent("s1", "task_complete", { taskId: "F3", status: "success" }, store.getState());
    handleStreamEvent("s1", "task_start", startEvent, store.getState());
    const rows = (store.getState().getTask("s1")?.timeline ?? []).filter((e) => e.type === "task");
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("running");
  });

  test("回放的 start（同 traceId）不重置任务追踪、不重复追加时间线", () => {
    seedTask("s1", "exec-1");
    const startData = { traceId: "trace-1" };
    handleStreamEvent("s1", "start", startData, store.getState());
    handleStreamEvent("s1", "task_start", { taskId: "F1", description: "审计", domain: "system_design" }, store.getState());
    const timelineBefore = store.getState().getTask("s1")?.timeline.length ?? 0;

    handleStreamEvent("s1", "start", startData, store.getState()); // 恢复连接回放的 start
    expect(store.getState().getTask("s1")?.timeline.length).toBe(timelineBefore);

    // 重放后新任务仍正常追加（追踪表未被回放破坏，也未被误清空）
    handleStreamEvent("s1", "task_start", { taskId: "F2", description: "平衡", domain: "combat_design" }, store.getState());
    const taskRows = (store.getState().getTask("s1")?.timeline ?? []).filter((e) => e.type === "task");
    expect(taskRows).toHaveLength(2);
  });
});

describe("主对话进度卡片锚点", () => {
  beforeEach(() => {
    store.getState().removeTask("s1");
  });

  const planEvent = {
    message: "规划完成",
    plan: {
      subTasks: [
        { id: "F1", domain: "combat_design", description: "战斗框架设计", dependencies: [] },
        { id: "F2", domain: "numerical_planning", description: "数值规划", dependencies: ["F1"] },
      ],
    },
  };

  test("plan 事件在主对话锚定一张进度卡片（确定性 ID）", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "plan", planEvent, store.getState());

    const messages = store.getState().getTask("s1")?.messages ?? [];
    const progressMsgs = messages.filter((m) => m.type === "progress");
    expect(progressMsgs).toHaveLength(1);
    expect(progressMsgs[0].id).toBe("msg_progress_exec-1");
    expect(progressMsgs[0].progress?.tasks).toEqual([
      { taskId: "F1", title: "战斗框架设计", agentName: "战斗策划" },
      { taskId: "F2", title: "数值规划", agentName: "数值策划" },
    ]);
  });

  test("HITL 重放/断线回放的重复 plan 事件不重复锚点", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "plan", planEvent, store.getState());
    handleStreamEvent("s1", "plan", planEvent, store.getState());
    handleStreamEvent("s1", "plan", planEvent, store.getState());
    expect((store.getState().getTask("s1")?.messages ?? []).filter((m) => m.type === "progress")).toHaveLength(1);
  });

  test("plan 警告或空规划不锚定卡片", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "plan", { warning: true, message: "降级" }, store.getState());
    handleStreamEvent("s1", "plan", { message: "空规划", plan: { subTasks: [] } }, store.getState());
    expect((store.getState().getTask("s1")?.messages ?? []).filter((m) => m.type === "progress")).toHaveLength(0);
  });

  test("新一轮执行（resetTaskTracking）后锚点换新，两轮卡片并存", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "plan", planEvent, store.getState());
    // 同会话重新发起执行：ConsolePage handleSubmit 会先 resetTaskTracking
    resetTaskTracking("s1");
    store.getState().updateTask("s1", { executionId: "exec-2" });
    handleStreamEvent("s1", "plan", planEvent, store.getState());

    const progressMsgs = (store.getState().getTask("s1")?.messages ?? []).filter((m) => m.type === "progress");
    expect(progressMsgs).toHaveLength(2);
    expect(progressMsgs.map((m) => m.id)).toEqual(["msg_progress_exec-1", "msg_progress_exec-2"]);
  });

  test("task_start 的时间线条目携带 taskId（进度卡片匹配键）", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "task_start", { taskId: "F3", description: "数值规划", domain: "numerical_planning" }, store.getState());
    const taskRows = (store.getState().getTask("s1")?.timeline ?? []).filter((e) => e.type === "task");
    expect(taskRows[0].taskId).toBe("F3");
  });

  test("hitl 事件不再向主对话追加系统消息，等待状态与时间线照常", () => {
    seedTask("s1", "exec-1");
    handleStreamEvent("s1", "hitl", {
      reviewPoint: "hitl-1-task-plan",
      checkpointId: "ckpt-1",
      feedback: "hitl-1-task-plan waiting for human review",
      plan: { subTasks: [{ id: "F1" }, { id: "F2" }] },
    }, store.getState());

    const task = store.getState().getTask("s1");
    expect((task?.messages ?? []).filter((m) => m.type === "system")).toHaveLength(0);
    expect(task?.status).toBe("waiting");
    expect(task?.hitlCheckpointId).toBe("ckpt-1");
    expect((task?.timeline ?? []).some((e) => e.type === "phase" && e.title.includes("等待审阅"))).toBe(true);
  });
});
