'use client';

import { create } from 'zustand';
import type { TimelineEntry } from '@/components/Console/StepsTimeline';
import type { DetailedLog } from '@/components/Console/DetailedLogs';

export type TaskMode = 'design' | 'query' | 'table';

export interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: string;
}

export interface TaskState {
  sessionId: string;
  mode: TaskMode;
  role: string;
  requirement: string;
  messages: ChatMessage[];
  timeline: TimelineEntry[];
  logs: DetailedLog[];
  knowledgeSources: Array<{ type: string; id: string; title?: string }>;
  executionTime: string;
  status: 'idle' | 'working' | 'waiting' | 'error';
  statusText: string;
  loading: boolean;
  streaming: boolean;
  streamingText: string;
  streamRef: { close: () => void } | null;
  startedAt: number;
}

export interface TaskStore {
  tasks: Map<string, TaskState>;
  activeSessionByMode: Record<TaskMode, string | null>;

  createTask: (mode: TaskMode, role: string, requirement: string) => string;
  updateTask: (sessionId: string, updates: Partial<TaskState>) => void;
  appendMessage: (sessionId: string, msg: ChatMessage) => void;
  appendTimeline: (sessionId: string, entry: TimelineEntry) => void;
  appendLog: (sessionId: string, log: DetailedLog) => void;
  updateTimelineEntry: (sessionId: string, entryId: string, updates: Partial<TimelineEntry>) => void;
  addToolToTask: (sessionId: string, taskId: string, tool: TimelineEntry) => void;
  setStreamRef: (sessionId: string, ref: { close: () => void } | null) => void;
  setActiveSession: (mode: TaskMode, sessionId: string | null) => void;
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
    executionTime: '0:00',
    status: 'idle',
    statusText: '就绪',
    loading: false,
    streaming: false,
    streamingText: '',
    streamRef: null,
    startedAt: 0,
  };
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: new Map(),
  activeSessionByMode: { design: null, query: null, table: null },

  createTask: (mode, role, requirement) => {
    const task = createInitialTaskState(mode, role, requirement);
    set((state) => {
      const tasks = new Map(state.tasks);
      tasks.set(task.sessionId, task);
      const activeSessionByMode = { ...state.activeSessionByMode, [mode]: task.sessionId };
      return { tasks, activeSessionByMode };
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
      const tasks = new Map(state.tasks);
      tasks.set(sessionId, { ...task, logs: [...task.logs, log] });
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

  setActiveSession: (mode, sessionId) => {
    set((state) => ({
      activeSessionByMode: { ...state.activeSessionByMode, [mode]: sessionId },
    }));
  },

  cancelTask: (sessionId) => {
    const task = get().tasks.get(sessionId);
    if (task?.streamRef) {
      task.streamRef.close();
    }
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
