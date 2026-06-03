import type { TimelineEntry } from '@/components/Console/StepsTimeline';
import type { DetailedLog } from '@/components/Console/DetailedLogs';
import type { TaskStore, ChatMessage } from '@/lib/stores/taskStore';

function getCurrentTime() {
  return new Date().toTimeString().split(' ')[0];
}

function mapDomainToAgentName(domain: string): string {
  const map: Record<string, string> = {
    system: '系统策划',
    combat: '战斗策划',
    numerical: '数值策划',
    gameplay: '玩法策划',
    executive: '执行策划',
    qa: 'QA策划',
  };
  return map[domain.toLowerCase()] || domain;
}

function summarizeToolArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  if (entries.length === 1) {
    const [key, value] = entries[0];
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    return strValue.length > 50 ? `${strValue.substring(0, 50)}...` : strValue;
  }
  return `${entries.length} 个参数`;
}

let activeTaskRef = new Map<string, string | null>();
let taskEntriesRef = new Map<string, Map<string, TimelineEntry>>();

export function resetTaskTracking(sessionId: string) {
  activeTaskRef.set(sessionId, null);
  taskEntriesRef.set(sessionId, new Map());
}

export function handleStreamEvent(
  sessionId: string,
  event: string,
  data: unknown,
  store: TaskStore
): void {
  const d = data as Record<string, unknown>;

  switch (event) {
    case 'start': {
      store.updateTask(sessionId, {
        loading: true,
        streaming: true,
        status: 'working',
        statusText: '处理中',
        startedAt: Date.now(),
      });
      resetTaskTracking(sessionId);
      const entry: TimelineEntry = {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'phase',
        title: '请求已接收，AI 正在分析需求',
        status: 'running',
      };
      store.appendTimeline(sessionId, entry);
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'System',
        message: '执行开始',
        data: { sessionId, mode: store.getTask(sessionId)?.mode },
      });
      break;
    }

    case 'plan': {
      store.updateTask(sessionId, { statusText: '任务规划中' });
      store.appendTimeline(sessionId, {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'phase',
        title: `规划: ${d.message as string}`,
        status: 'completed',
      });
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'Director',
        message: d.message as string,
      });
      break;
    }

    case 'route': {
      store.updateTask(sessionId, { statusText: '路由分配中' });
      store.appendTimeline(sessionId, {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'phase',
        title: `路由: ${d.message as string}`,
        status: 'completed',
      });
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'Router',
        message: d.message as string,
      });
      break;
    }

    case 'task_start': {
      const taskId = d.taskId as string;
      const description = d.description as string;
      const domain = d.domain as string;
      const agentName = mapDomainToAgentName(domain);

      store.updateTask(sessionId, { statusText: `执行: ${description}` });
      const entry: TimelineEntry = {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'task',
        title: description,
        agentName,
        status: 'running',
      };
      store.appendTimeline(sessionId, entry);

      const taskMap = taskEntriesRef.get(sessionId);
      if (taskMap) {
        taskMap.set(taskId, entry);
      }
      activeTaskRef.set(sessionId, taskId);

      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: agentName,
        message: `开始任务: ${description}`,
        data: { taskId, domain },
      });
      break;
    }

    case 'thinking': {
      const agentName = d.agentName as string;
      const iteration = d.iteration as number;
      const maxIterations = d.maxIterations as number;
      const message = d.message as string;

      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'debug',
        source: agentName,
        message,
        data: { iteration, maxIterations },
      });
      break;
    }

    case 'tool_start': {
      const taskId = d.taskId as string;
      const toolName = d.toolName as string;
      const agentName = d.agentName as string;
      const args = d.args as Record<string, unknown>;

      const toolEntry: TimelineEntry = {
        id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'tool',
        title: toolName,
        detail: summarizeToolArgs(args),
        status: 'running',
      };

      const taskMap = taskEntriesRef.get(sessionId);
      const taskEntry = taskMap?.get(taskId);
      if (taskEntry) {
        store.addToolToTask(sessionId, taskEntry.id, toolEntry);
      }

      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: toolName,
        message: '工具调用开始',
        data: args,
      });
      break;
    }

    case 'tool_complete': {
      const taskId = d.taskId as string;
      const toolName = d.toolName as string;
      const durationMs = d.durationMs as number | undefined;
      const success = d.success as boolean;
      const summary = d.summary as string;

      const taskMap = taskEntriesRef.get(sessionId);
      const taskEntry = taskMap?.get(taskId);
      if (taskEntry) {
        store.updateTask(sessionId, {
          timeline: store.getTask(sessionId)?.timeline.map((entry) => {
            if (entry.id === taskEntry.id && entry.children) {
              const updatedChildren = entry.children.map((child) => {
                if (child.type === 'tool' && child.title === toolName && child.status === 'running') {
                  return {
                    ...child,
                    status: success ? ('completed' as const) : ('error' as const),
                    durationMs,
                    detail: summary,
                  };
                }
                return child;
              });
              return { ...entry, children: updatedChildren };
            }
            return entry;
          }) || [],
        });
      }

      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: success ? 'info' : 'error',
        source: toolName,
        message: `工具调用${success ? '成功' : '失败'}`,
        data: { summary },
        durationMs,
      });
      break;
    }

    case 'knowledge_used': {
      const sourceType = d.sourceType as string;
      const sources = d.sources as Array<{ type: string; id: string; title?: string }>;

      const task = store.getTask(sessionId);
      if (task) {
        store.updateTask(sessionId, {
          knowledgeSources: [...task.knowledgeSources, ...sources],
        });
      }
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'Knowledge',
        message: `引用 ${sourceType} 来源 ${sources.length} 个`,
        data: { sources },
      });
      break;
    }

    case 'task_complete': {
      const taskId = d.taskId as string;
      const taskMap = taskEntriesRef.get(sessionId);
      const taskEntry = taskMap?.get(taskId);

      if (taskEntry) {
        store.updateTimelineEntry(sessionId, taskEntry.id, { status: 'completed' });
      }
      activeTaskRef.set(sessionId, null);
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'Task',
        message: `任务完成: ${taskId}`,
      });
      break;
    }

    case 'integrate': {
      store.updateTask(sessionId, { statusText: '整合结果中' });
      store.appendTimeline(sessionId, {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'phase',
        title: '整合: 正在合并子任务结果',
        status: 'running',
      });
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'Integrator',
        message: '开始整合',
      });
      break;
    }

    case 'chunk': {
      const text = (d.text as string) ?? '';
      const task = store.getTask(sessionId);
      if (task) {
        store.updateTask(sessionId, { streamingText: task.streamingText + text });
      }
      break;
    }

    case 'complete': {
      const output = (d.output as string) || store.getTask(sessionId)?.streamingText || '';
      if (output) {
        const msg: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'ai',
          content: output,
          timestamp: getCurrentTime(),
        };
        store.appendMessage(sessionId, msg);
      }

      store.updateTask(sessionId, {
        streaming: false,
        loading: false,
        status: 'idle',
        statusText: '就绪',
        streamingText: '',
      });

      store.appendTimeline(sessionId, {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'complete',
        title: '执行完成',
        status: 'completed',
      });
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'info',
        source: 'System',
        message: '执行完成',
        data: { outputLength: output.length },
      });
      break;
    }

    case 'error': {
      const errMsg = (d.error as string) || '未知错误';
      const msg: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        type: 'system',
        content: `执行出错: ${errMsg}`,
        timestamp: getCurrentTime(),
      };
      store.appendMessage(sessionId, msg);

      store.updateTask(sessionId, {
        streaming: false,
        loading: false,
        status: 'error',
        statusText: '错误',
        streamingText: '',
      });

      store.appendTimeline(sessionId, {
        id: `timeline_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        type: 'error',
        title: `错误: ${errMsg}`,
        status: 'error',
      });
      store.appendLog(sessionId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        time: getCurrentTime(),
        level: 'error',
        source: 'System',
        message: '执行失败',
        data: { error: errMsg },
      });

      const activeTaskId = activeTaskRef.get(sessionId);
      if (activeTaskId) {
        const taskMap = taskEntriesRef.get(sessionId);
        const taskEntry = taskMap?.get(activeTaskId);
        if (taskEntry) {
          store.updateTimelineEntry(sessionId, taskEntry.id, { status: 'error' });
        }
      }
      break;
    }
  }
}
