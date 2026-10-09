'use client';

import { create } from 'zustand';
import type { TimelineEntry } from '@/components/Console/StepsTimeline';
import type { DetailedLog } from '@/components/Console/DetailedLogs';
import { cancelExecution, type StreamHandle } from '@/lib/api';

/** 单个会话在内存中保留的活动日志上限（与 logStore 持久化上限一致）。 */
const MAX_LIVE_LOGS = 500;

export type TaskMode = 'design' | 'query' | 'table';

/** 进度卡片锚点消息携带的规划任务清单（plan 事件快照，随卡片原地更新状态） */
export interface ProgressPlanTask {
  taskId: string;
  title: string;
  agentName?: string;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system' | 'progress';
  content: string;
  timestamp: string;
  /** 该消息所属执行的策略（一会话三模式）；旧消息与系统消息无此字段 */
  mode?: TaskMode;
  /** 本条回答引用的知识库证据（WeKnora 检索）；无检索为空 */
  sources?: KnowledgeSource[];
  /** type==='progress'：本执行的规划任务清单，状态从 timeline 按 taskId 实时取 */
  progress?: { tasks: ProgressPlanTask[] };
}

export interface KnowledgeSource {
  type: string;
  id: string;
  title?: string;
  relevance?: string;
  /** 检索得分（WeKnora hybrid_search / wiki_search 返回） */
  score?: number;
  /** 命中片段预览（截断） */
  snippet?: string;
}

export interface TaskState {
  sessionId: string;
  mode: TaskMode;
  role: string;
  requirement: string;
  messages: ChatMessage[];
  timeline: TimelineEntry[];
  logs: DetailedLog[];
  knowledgeSources: KnowledgeSource[];
  executionTime: string;
  status: 'idle' | 'working' | 'waiting' | 'error';
  statusText: string;
  loading: boolean;
  streaming: boolean;
  streamingText: string;
  streamRef: StreamHandle | null;
  /** Server execution id for resume / refresh. */
  executionId: string | null;
  /** Pending HITL checkpoint id when status === 'waiting'. */
  hitlCheckpointId: string | null;
  lastEventId: string | null;
  streamResumeAttempts: number;
  startedAt: number;
  /** 待水合的执行 id：跨页选会话时由目标页面消费（选择页可能已卸载） */
  pendingHydration: string | null;
  /** 本轮执行累计的证据（complete 时附加到回答消息并清空；跨轮不累计） */
  pendingSources: KnowledgeSource[];
}

export interface TaskStore {
  tasks: Map<string, TaskState>;
  /** 一会话三模式：活动会话全局唯一，mode 只是 TaskState 上的"末次执行策略"标签 */
  activeSessionId: string | null;

  /** sessionId 可选：会话历史回填时传入真实会话 id，保证 Map 键与 sessionId 一致 */
  createTask: (mode: TaskMode, role: string, requirement: string, sessionId?: string) => string;
  updateTask: (sessionId: string, updates: Partial<TaskState>) => void;
  appendMessage: (sessionId: string, msg: ChatMessage) => void;
  appendTimeline: (sessionId: string, entry: TimelineEntry) => void;
  appendLog: (sessionId: string, log: DetailedLog) => void;
  updateTimelineEntry: (sessionId: string, entryId: string, updates: Partial<TimelineEntry>) => void;
  addToolToTask: (sessionId: string, taskId: string, tool: TimelineEntry) => void;
  setStreamRef: (sessionId: string, ref: StreamHandle | null) => void;
  setActiveSession: (sessionId: string | null) => void;
  cancelTask: (sessionId: string) => void;
  removeTask: (sessionId: string) => void;
  getTask: (sessionId: string) => TaskState | undefined;
  getTasksByMode: (mode: TaskMode) => TaskState[];
  getRunningTasks: () => TaskState[];
}

function generateSessionId(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `gdt-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

function createInitialTaskState(mode: TaskMode, role: string, requirement: string): TaskState {
  return {
    sessionId: generateSessionId(),
    mode,
    role,
    requirement,
    messages: [],
    timeline: [],
    logs: [],
    knowledgeSources: [],
    pendingSources: [],
    executionTime: '0:00',
    status: 'idle',
    statusText: '就绪',
    loading: false,
    streaming: false,
    streamingText: '',
    streamRef: null,
    executionId: null,
    hitlCheckpointId: null,
    lastEventId: null,
    streamResumeAttempts: 0,
    startedAt: 0,
    pendingHydration: null,
  };
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: new Map(),
  activeSessionId: null,

  createTask: (mode, role, requirement, sessionId) => {
    const task = createInitialTaskState(mode, role, requirement);
    if (sessionId) task.sessionId = sessionId;
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.sessionId, task);
      return { tasks, activeSessionId: task.sessionId };
    });
    return task.sessionId;
  },

  updateTask: (sessionId, updates) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, { ...task, ...updates });
      return { tasks };
    });
  },

  appendMessage: (sessionId, msg) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      // 幂等：完成消息同时由 SSE complete 与轮询兜底（applyExecution）两条
      // 路径追加，刷新/重连还会回放历史事件——不带确定性 ID 去重会被显示
      // 多遍（实测同一份完成总结在聊天里出现多次）。
      if (msg.id && task.messages.some((m) => m.id === msg.id)) return state;
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, { ...task, messages: [...task.messages, msg] });
      return { tasks };
    });
  },

  appendTimeline: (sessionId, entry) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, { ...task, timeline: [...task.timeline, entry] });
      return { tasks };
    });
  },

  appendLog: (sessionId, log) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      // 活动会话的日志随执行无限增长（每次工具调用至少 2 条），渲染端
      // DetailedLogs 会全量 map——与 logStore 的持久化上限对齐，只保留
      // 最近 MAX_LIVE_LOGS 条，避免长任务把内存与重渲染拖垮
      const logs = task.logs.length >= MAX_LIVE_LOGS
        ? [...task.logs.slice(-(MAX_LIVE_LOGS - 1)), log]
        : [...task.logs, log];
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, { ...task, logs });
      return { tasks };
    });
  },

  updateTimelineEntry: (sessionId, entryId, updates) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, {
        ...task,
        timeline: task.timeline.map((entry) => {
          if (entry.id === entryId) return { ...entry, ...updates };
          if (entry.children) {
            const updatedChildren = entry.children.map((child) =>
              child.id === entryId ? { ...child, ...updates } : child
            );
            if (updatedChildren !== entry.children) {
              return { ...entry, children: updatedChildren };
            }
          }
          return entry;
        }),
      });
      return { tasks };
    });
  },

  addToolToTask: (sessionId, taskId, tool) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, {
        ...task,
        timeline: task.timeline.map((entry) => {
          if (entry.id === taskId) {
            return { ...entry, children: [...(entry.children || []), tool] };
          }
          return entry;
        }),
      });
      return { tasks };
    });
  },

  setStreamRef: (sessionId, ref) => {
    set((state) => {
      const task = state.tasks.get(sessionId);
      if (!task) return state;
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, { ...task, streamRef: ref });
      return { tasks };
    });
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  cancelTask: (sessionId) => {
    const task = get().tasks.get(sessionId);
    if (task?.streamRef) {
      task.streamRef.close();
    }
    // Notify backend to abort the running execution
    cancelExecution(sessionId);
    set((state) => {
      const tasks = new Map(state.tasks);
      const task = tasks.get(sessionId);
      if (task) {
        tasks.set(sessionId, {
          ...task,
          loading: false,
          streaming: false,
          streamRef: null,
          status: 'idle',
          statusText: '已取消',
        });
      }
      return { tasks };
    });
  },

  removeTask: (sessionId) => {
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.delete(sessionId);
      return { tasks };
    });
  },

  getTask: (sessionId) => {
    return get().tasks.get(sessionId);
  },

  getTasksByMode: (mode) => {
    return Array.from(get().tasks.values()).filter((t) => t.mode === mode);
  },

  getRunningTasks: () => {
    return Array.from(get().tasks.values()).filter((t) => t.loading || t.streaming);
  },
}));
