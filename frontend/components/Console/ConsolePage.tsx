'use client';

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Loader2, Zap, User, Bot, Info, Download, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import Header from '@/components/Console/Header';
import SessionSidebar from '@/components/Console/SessionSidebar';
import RightPanel from '@/components/Console/RightPanel';
import { reportUserSignal } from '@/components/Console/ResultPanel';
import SetupModal from '@/components/Console/SetupModal';
import HitlReviewModal from '@/components/Console/HitlReviewModal';
import { executeDesignStream, resumeExecutionStream, getExecution, getConfigStatus, listHITLCheckpoints, getSessionTurns, type SessionMeta, type SessionTurn, type StreamHandle } from '@/lib/api';
import { useTaskStore, type TaskMode, type ChatMessage } from '@/lib/stores/taskStore';
import { handleStreamEvent, resetTaskTracking } from '@/lib/streamHandler';

const MAX_STREAM_RESUMES = 2;
const TERMINAL_EXECUTION_STATUSES = new Set([
  'completed', 'failed', 'cancelled', 'timed_out',
]);
const WAITING_EXECUTION_STATUSES = new Set([
  'waiting_hitl',
]);

interface Props {
  initialMode?: TaskMode;
}

function getCurrentTime() {
  return new Date().toTimeString().split(' ')[0];
}

/** ?mode= 查询参数合法值（/query、/table 旧路径重定向的落点） */
function normalizeMode(value: string | null): TaskMode | null {
  return value === 'design' || value === 'query' || value === 'table' ? value : null;
}

export default function ConsolePage({ initialMode }: Props) {
  const router = useRouter();
  const store = useTaskStore();
  const activeSessionId = store.activeSessionId;
  const task = activeSessionId ? store.getTask(activeSessionId) : undefined;

  // 一会话三模式：mode 不再是路由身份，而是"下一条消息的执行策略"。
  // 同页切换（setMode）不卸载组件、不断流。
  const [mode, setMode] = useState<TaskMode>(
    () => initialMode
      ?? (typeof window !== 'undefined' ? normalizeMode(new URLSearchParams(window.location.search).get('mode')) : null)
      ?? 'design',
  );

  const mountedRef = useRef(true);
  const execTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingRafRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Resizable panel ratio: dialog : monitor = 3 : 2
  const [dialogFlex, setDialogFlex] = useState(3);
  const [monitorFlex, setMonitorFlex] = useState(2);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const sidebarWidth = 256; // w-64
      const availableWidth = rect.width - sidebarWidth;
      const offsetX = e.clientX - rect.left - sidebarWidth;
      const ratio = Math.min(Math.max(offsetX / availableWidth, 0.3), 0.7);
      const total = 5;
      const newDialogFlex = ratio * total;
      setDialogFlex(newDialogFlex);
      setMonitorFlex(total - newDialogFlex);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Cleanup on unmount: cancel active stream and mark unmounted
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeSessionId) {
        const t = store.getTask(activeSessionId);
        if (t?.streamRef) {
          t.streamRef.close();
        }
      }
    };
  }, []);

  // Local ephemeral state
  const [pendingRole, setPendingRole] = useState('chief_designer');
  const effectiveRole = task?.role ?? pendingRole;
  const roleLocked = !!task && (task.messages.length > 0);
  const [requirement, setRequirement] = useState('');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<'steps' | 'logs' | 'files' | 'knowledge'>('steps');
  const [useStream, setUseStream] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [hitlModalOpen, setHitlModalOpen] = useState(false);
  const [hitlFallbackContent, setHitlFallbackContent] = useState<string | undefined>();

  // Check config status on mount
  useEffect(() => {
    getConfigStatus()
      .then((status) => {
        if (status.needsApiKey) {
          setShowSetupModal(true);
          setIsFirstTimeSetup(true);
        }
      })
      .catch(() => {});
  }, []);

  // Refresh: if we have an executionId and task still looks in-flight, pull terminal/waiting state.
  useEffect(() => {
    if (!task?.executionId || (!task.loading && task.status !== 'waiting')) return;

    const applyExecution = (execution: Awaited<ReturnType<typeof getExecution>>) => {
      // 注意只挡组件卸载：loading 翻转会让本 effect 重跑并把在途响应标记
      // cancelled，若一并丢弃，轮询写入的服务端耗时/起点就永远丢失。
      if (!mountedRef.current) return;
      // 耗时以服务端执行时间为准（水合/选中历史会话没有本地 startedAt，
      // 上一版计时器因此永远不启动、面板与任务卡片恒显 0:00）：
      // 播种 startedAt 让秒表按服务端起点走；已结束的执行直接定格总耗时。
      const serverStartMs = execution.createdAt ? Date.parse(execution.createdAt) : 0;
      const serverEndMs = execution.updatedAt ? Date.parse(execution.updatedAt) : Date.now();
      const fmt = (ms: number) => {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const sec = total % 60;
        return h > 0
          ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
          : `${m}:${sec.toString().padStart(2, '0')}`;
      };
      if (serverStartMs > 0 && task.startedAt <= 0) {
        store.updateTask(task.sessionId, { startedAt: serverStartMs });
      }
      if (TERMINAL_EXECUTION_STATUSES.has(execution.status) && serverStartMs > 0) {
        store.updateTask(task.sessionId, { executionTime: fmt(serverEndMs - serverStartMs) });
      }
      if (WAITING_EXECUTION_STATUSES.has(execution.status)) {
        if (serverStartMs > 0) {
          store.updateTask(task.sessionId, { executionTime: fmt(Date.now() - serverStartMs) });
        }
        store.updateTask(task.sessionId, {
          loading: false,
          streaming: false,
          status: 'waiting',
          statusText: '等待人工审阅',
          streamRef: null,
        });
        // Resolve checkpoint id if stream event was missed.
        if (!store.getTask(task.sessionId)?.hitlCheckpointId) {
          listHITLCheckpoints(task.sessionId)
            .then((res) => {
              const pending = res.checkpoints.find(
                (cp) => cp.status === 'waiting_review' || cp.status === 'escalated',
              );
              if (pending) {
                store.updateTask(task.sessionId, { hitlCheckpointId: pending.id });
                setHitlModalOpen(true);
              }
            })
            .catch(() => {});
        } else {
          setHitlModalOpen(true);
        }
        setRefreshTick((t) => t + 1);
        return;
      }
      if (!TERMINAL_EXECUTION_STATUSES.has(execution.status)) return;
      const output = typeof execution.output === 'string' ? execution.output
        : typeof execution.result === 'string' ? execution.result
        : null;
      if (output) {
        store.appendMessage(task.sessionId, {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'ai',
          content: output,
          timestamp: getCurrentTime(),
        });
      }
      if (execution.errorMessage) {
        store.appendMessage(task.sessionId, {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'system',
          content: `执行结束（${execution.status}）: ${execution.errorMessage}`,
          timestamp: getCurrentTime(),
        });
      } else if (execution.status === 'failed') {
        store.appendMessage(task.sessionId, {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'system',
          content: `执行失败（未返回详细错误信息，请查看右侧日志或服务端日志）`,
          timestamp: getCurrentTime(),
        });
      }
      store.updateTask(task.sessionId, {
        loading: false,
        streaming: false,
        status: execution.status === 'completed' ? 'idle' : 'error',
        statusText: execution.status === 'completed'
          ? '完成'
          : (execution.errorMessage
            ? `错误: ${String(execution.errorMessage).slice(0, 80)}`
            : execution.status),
        streamRef: null,
      });
      setRefreshTick((t) => t + 1);
    };

    getExecution(task.executionId).then(applyExecution).catch((err) => {
      // 执行记录已不存在（会话/执行被删除）：终止 loading，避免状态卡片常驻
      if (/404/.test(String(err?.message))) {
        store.updateTask(task.sessionId, {
          loading: false,
          streaming: false,
          streamRef: null,
          status: 'idle',
          statusText: '执行记录不存在',
        });
      }
    });
    // Keep polling while loading so silent worker failures still surface.
    const timer = task.loading
      ? setInterval(() => {
          if (!task.executionId) return;
          getExecution(task.executionId).then(applyExecution).catch((err) => {
            if (/404/.test(String(err?.message))) {
              store.updateTask(task.sessionId, {
                loading: false,
                streaming: false,
                streamRef: null,
                status: 'idle',
                statusText: '执行记录不存在',
              });
            }
          });
        }, 4000)
      : null;
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [task?.executionId, task?.sessionId, task?.loading, task?.status]);

  const syncStreamMeta = useCallback((sessionId: string, handle: StreamHandle) => {
    const executionId = handle.getExecutionId();
    const lastEventId = handle.getLastEventId();
    const patch: Partial<import('@/lib/stores/taskStore').TaskState> = {};
    if (executionId) patch.executionId = executionId;
    if (lastEventId) patch.lastEventId = lastEventId;
    if (Object.keys(patch).length > 0) store.updateTask(sessionId, patch);
  }, [store]);

  const attachStream = useCallback((
    sessionId: string,
    handle: StreamHandle,
  ) => {
    store.setStreamRef(sessionId, handle);
    // Headers arrive async; poll briefly for execution id / last event id.
    let ticks = 0;
    const timer = setInterval(() => {
      syncStreamMeta(sessionId, handle);
      ticks += 1;
      if (ticks >= 40 || !store.getTask(sessionId)?.loading) {
        clearInterval(timer);
      }
    }, 250);
  }, [store, syncStreamMeta]);

  const onStreamEventRef = useRef<(sessionId: string, event: string, data: unknown) => void>(() => {});

  // 会话历史回放进行中的任务（回放期间不弹 HITL 弹窗，结束后按最终状态决定）
  const hydratingSessionsRef = useRef<Set<string>>(new Set());
  // 选会话后正在拉取历史轮次的会话（防双击期间重复重建条目/重复播种）
  const selectInFlightRef = useRef<Set<string>>(new Set());
  // 待水合任务的会话元数据（供回放失败时的摘要兜底）
  const pendingSessionMetaRef = useRef<Map<string, SessionMeta>>(new Map());

  const tryResumeStream = useCallback((sessionId: string, reason: string) => {
    const current = store.getTask(sessionId);
    if (!current?.executionId) return false;
    if (current.streamResumeAttempts >= MAX_STREAM_RESUMES) return false;

    const attempts = current.streamResumeAttempts + 1;
    store.updateTask(sessionId, {
      streamResumeAttempts: attempts,
      loading: true,
      streaming: true,
      status: 'working',
      statusText: `重连中 (${attempts}/${MAX_STREAM_RESUMES})`,
    });
    store.appendLog(sessionId, {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      time: getCurrentTime(),
      level: 'warn',
      source: 'SSE',
      message: `流中断，尝试续订 #${attempts}: ${reason}`,
    });

    const resume = resumeExecutionStream(
      current.executionId,
      current.lastEventId ?? current.streamRef?.getLastEventId() ?? undefined,
      (event, data) => onStreamEventRef.current(sessionId, event, data),
      (err) => {
        if (!mountedRef.current) return;
        if (!tryResumeStream(sessionId, err.message)) {
          store.updateTask(sessionId, {
            loading: false,
            streaming: false,
            status: 'error',
            statusText: '错误',
            streamingText: '',
          });
          store.appendMessage(sessionId, {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            type: 'system',
            content: `网络错误: ${err.message}`,
            timestamp: getCurrentTime(),
          });
        }
      },
      // 续订流也可能被服务端/中间层干净收尾：只要任务仍在执行就继续续订
      // （受 MAX_STREAM_RESUMES 限制；失败时保留 4s getExecution 轮询兜底）
      () => {
        if (!mountedRef.current) return;
        const t = store.getTask(sessionId);
        if (t?.loading) tryResumeStream(sessionId, '续订流已结束');
      },
    );
    attachStream(sessionId, resume);
    return true;
  }, [store, attachStream]);

  // 消费待水合任务：跨页选会话时选择页可能已随路由卸载，由挂载中的
  // 目标页面接手回放（事件回调保持存活，不会被 mountedRef 丢弃）
  const hydrateTaskRef = task;
  useEffect(() => {
    const t = hydrateTaskRef;
    if (!t?.pendingHydration || !t.executionId) return;
    const sid = t.sessionId;
    const execId = t.pendingHydration;
    store.updateTask(sid, { pendingHydration: null });
    hydratingSessionsRef.current.add(sid);
    store.getTask(sid)?.streamRef?.close();
    const handle = resumeExecutionStream(
      execId,
      null,
      (event, data) => onStreamEventRef.current(sid, event, data),
      () => {
        // 回放失败：退回摘要展示
        hydratingSessionsRef.current.delete(sid);
        const status = store.getTask(sid)?.status;
        store.updateTask(sid, {
          loading: false,
          streaming: false,
          status: status === 'working' ? 'idle' : status,
          statusText: '历史执行记录不可用',
        });
        const session = pendingSessionMetaRef.current.get(sid);
        pendingSessionMetaRef.current.delete(sid);
        if (session) {
          appendSessionSummary(sid, session);
        }
      },
    );
    store.setStreamRef(sid, handle);
  }, [hydrateTaskRef?.pendingHydration, hydrateTaskRef?.executionId, hydrateTaskRef, store]);

  // Timer for active task
  useEffect(() => {
    if (task?.loading && task.startedAt > 0) {
      if (execTimerRef.current) clearInterval(execTimerRef.current);
      execTimerRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - task.startedAt) / 1000);
        const m = Math.floor(s / 60);
        const elapsed = `${m}:${(s % 60).toString().padStart(2, '0')}`;
        store.updateTask(task.sessionId, { executionTime: elapsed });
      }, 1000);
    } else {
      if (execTimerRef.current) {
        clearInterval(execTimerRef.current);
        execTimerRef.current = null;
      }
    }
    return () => {
      if (execTimerRef.current) {
        clearInterval(execTimerRef.current);
        execTimerRef.current = null;
      }
    };
  }, [task?.loading, task?.startedAt, task?.sessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const onStreamEvent = useCallback(
    (sessionId: string, event: string, data: unknown) => {
      if (!mountedRef.current) return;
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[GDT:${event}]`, data);
      }
      const handle = store.getTask(sessionId)?.streamRef;
      if (handle) syncStreamMeta(sessionId, handle);
      // 回放流里的 start 事件是实时执行的生命周期重置（清 startedAt/
      // 状态归位）——水合回放时跳过，否则会覆盖轮询写入的服务端耗时
      if (event === 'start' && hydratingSessionsRef.current.has(sessionId)) {
        return;
      }
      handleStreamEvent(sessionId, event, data, store);

      // 历史回放门控：重放期间 HITL 弹窗延迟判定（静默 1.5s 视为回放结束，
      // 若最终状态是 waiting 才弹窗——说明该检查点确实还在等人工审阅）
      if (hydratingSessionsRef.current.has(sessionId)) {
        const finishHydration = () => {
          hydratingSessionsRef.current.delete(sessionId);
          const t = store.getTask(sessionId);
          store.updateTask(sessionId, { loading: false, streaming: false });
          if (t?.status === 'waiting') setHitlModalOpen(true);
        };
        if (event === 'complete' || event === 'error' || event === 'execution_terminal' || event === 'cancelled') {
          finishHydration();
        } else if (event === 'hitl' || event === 'execution_status') {
          window.setTimeout(() => {
            if (hydratingSessionsRef.current.has(sessionId) && store.getTask(sessionId)?.status === 'waiting') {
              finishHydration();
            }
          }, 1500);
        }
      }

      // Scroll on chunk
      if (event === 'chunk') {
        if (!streamingRafRef.current) {
          streamingRafRef.current = requestAnimationFrame(() => {
            scrollToBottom();
            streamingRafRef.current = null;
          });
        }
      }

      if (event === 'hitl') {
        const d = data as Record<string, unknown>;
        const plan = d.plan;
        if (plan && typeof plan === 'object') {
          try {
            setHitlFallbackContent(JSON.stringify(plan, null, 2));
          } catch {
            setHitlFallbackContent(undefined);
          }
        }
        if (!hydratingSessionsRef.current.has(sessionId)) setHitlModalOpen(true);
      }

      if (event === 'execution_status') {
        const d = data as Record<string, unknown>;
        if (d.status === 'waiting_hitl') {
          const checkpointId = d.checkpointId as string | undefined;
          if (checkpointId) {
            store.updateTask(sessionId, { hitlCheckpointId: checkpointId });
          }
          if (!hydratingSessionsRef.current.has(sessionId)) setHitlModalOpen(true);
        }
      }

      if (event === 'complete') {
        const taskRole = store.getTask(sessionId)?.role;
        if (taskRole === 'chief_designer') {
          setRightPanelTab('files');
        }
        store.updateTask(sessionId, { streamResumeAttempts: 0, hitlCheckpointId: null });
      }

      if (event === 'complete' || event === 'error' || event === 'hitl' || event === 'execution_terminal') {
        setRefreshTick((t) => t + 1);
      }
    },
    [store, syncStreamMeta]
  );

  onStreamEventRef.current = onStreamEvent;

  const handleHitlReviewed = useCallback((result: {
    action: 'approve' | 'reject' | 'modify';
    checkpoint: { id: string; executionId?: string };
    executionId?: string;
  }) => {
    if (!task) return;
    const sid = task.sessionId;
    const actionLabel =
      result.action === 'approve' ? '已通过' : result.action === 'reject' ? '已驳回' : '已修改并确认';
    store.appendMessage(sid, {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      type: 'system',
      content: `人工审阅${actionLabel}`,
      timestamp: getCurrentTime(),
    });
    store.updateTask(sid, {
      hitlCheckpointId: null,
      status: result.action === 'reject' ? 'error' : 'working',
      statusText: result.action === 'reject' ? '审阅驳回' : '审阅通过，继续执行…',
      loading: result.action !== 'reject',
      streaming: result.action !== 'reject',
    });
    setHitlModalOpen(false);
    setHitlFallbackContent(undefined);
    setRefreshTick((t) => t + 1);

    if (result.action === 'reject') return;

    const executionId = result.executionId || result.checkpoint.executionId || task.executionId;
    if (!executionId) return;

    store.updateTask(sid, { executionId, streamResumeAttempts: 0 });
    const resume = resumeExecutionStream(
      executionId,
      task.lastEventId ?? undefined,
      (event, data) => onStreamEventRef.current(sid, event, data),
      (err) => {
        if (!mountedRef.current) return;
        if (!tryResumeStream(sid, err.message)) {
          store.updateTask(sid, {
            loading: false,
            streaming: false,
            status: 'error',
            statusText: '错误',
          });
          store.appendMessage(sid, {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            type: 'system',
            content: `续订失败: ${err.message}`,
            timestamp: getCurrentTime(),
          });
        }
      },
      () => {
        if (!mountedRef.current) return;
        const t = store.getTask(sid);
        if (t?.loading) tryResumeStream(sid, '审批后续订流已结束');
      },
    );
    attachStream(sid, resume);
  }, [task, store, attachStream, tryResumeStream]);

  const handleSubmit = async () => {
    if (!requirement.trim()) return;
    if (task?.loading) return;

    // 一会话三模式：所有模式都复用活动会话（查知识 → 出策划案 → 配表
    // 在同一会话内延续上下文，后端做 SESSION_CONTEXT_MAX* 蒸馏注入）。
    // 指针可能指向已删除的会话（删除会话后 activeSessionId 未清空）：
    // 条目不存在时必须新建，否则 appendMessage 全部静默无效、页面空白
    const sid = (activeSessionId && store.getTask(activeSessionId))
      ? activeSessionId
      : store.createTask(mode, effectiveRole, requirement.trim());
    store.setActiveSession(sid);
    // 同步"末次执行策略"标签：侧栏与 TaskDock 卡片按 task.mode 显示
    store.updateTask(sid, { mode, role: effectiveRole });
    resetTaskTracking(sid);

    // 全模式携带会话历史：后端 buildSessionContextBlock 有二次封顶
    // （20 条 / 6000 字符），客户端沿用"末 10 条 user/ai"即可。
    // 必须在 append 当前消息之前取快照——requirement 本身不进 history。
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = (store.getTask(sid)?.messages ?? [])
      .filter((m) => m.type === 'user' || m.type === 'ai')
      .slice(-10)
      .map((m) => ({
        role: m.type === 'user' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }));

    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      type: 'user' as const,
      content: requirement.trim(),
      timestamp: getCurrentTime(),
    };
    store.appendMessage(sid, msg);

    const reqText = requirement.trim();
    setRequirement('');

    if (useStream) {
      store.updateTask(sid, {
        loading: true,
        streaming: true,
        status: 'working',
        statusText: '执行中',
        startedAt: Date.now(),
        streamResumeAttempts: 0,
        executionId: null,
        lastEventId: null,
      });
      const stream = executeDesignStream(
        { requirement: reqText, mode, role: effectiveRole, sessionId: sid, history },
        (event, data) => onStreamEvent(sid, event, data),
        (err) => {
          if (!mountedRef.current) return;
          syncStreamMeta(sid, stream);
          if (tryResumeStream(sid, err.message)) return;
          store.updateTask(sid, {
            loading: false,
            streaming: false,
            status: 'error',
            statusText: '错误',
            streamingText: '',
          });
          store.appendMessage(sid, {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            type: 'system',
            content: `网络错误: ${err.message}`,
            timestamp: getCurrentTime(),
          });
          store.appendLog(sid, {
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            time: getCurrentTime(),
            level: 'error',
            source: '请求异常',
            message: err.message,
          });
        },
        // 流被干净收尾（无事件无报错）时：捕获 executionId 并续订，
        // 避免任务仍在执行而 UI 静默失聪（run 2026-10-04 16:27 的教训）
        () => {
          if (!mountedRef.current) return;
          syncStreamMeta(sid, stream);
          const t = store.getTask(sid);
          if (t?.loading) tryResumeStream(sid, '执行流已结束');
        },
      );
      attachStream(sid, stream);
    } else {
      try {
        const { executeDesign } = await import('@/lib/api');
        const res = await executeDesign({ requirement: reqText, mode, role: effectiveRole, sessionId: sid, history });
        if (mountedRef.current) {
          if (res.success && res.output) {
            store.appendMessage(sid, {
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
              type: 'ai',
              content: res.output,
              timestamp: getCurrentTime(),
            });
            store.updateTask(sid, { status: 'idle', statusText: '就绪', loading: false });
          } else if (res.error) {
            store.appendMessage(sid, {
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
              type: 'system',
              content: `执行出错: ${res.error}`,
              timestamp: getCurrentTime(),
            });
            store.updateTask(sid, { status: 'error', statusText: '错误', loading: false });
          }
          setRefreshTick((t) => t + 1);
        }
      } catch (err) {
        if (mountedRef.current) {
          const msg = err instanceof Error ? err.message : '网络请求失败';
          store.appendMessage(sid, {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
            type: 'system',
            content: `网络错误: ${msg}`,
            timestamp: getCurrentTime(),
          });
          store.updateTask(sid, { loading: false, status: 'error', statusText: '错误' });
        }
      }
    }
  };

  const handleCancel = () => {
    if (activeSessionId) {
      store.cancelTask(activeSessionId);
    }
  };

  const handleNewChat = () => {
    store.setActiveSession(null);
    setRequirement('');
  };

  const appendSessionSummary = (sid: string, session: SessionMeta) => {
    // 无执行记录时的兜底：用会话摘要拼一个只读视图
    if (session.requirement) {
      store.appendMessage(sid, {
        id: `msg_${Date.now()}_u_${Math.random().toString(36).slice(2, 4)}`,
        type: 'user',
        content: session.requirement,
        timestamp: getCurrentTime(),
      });
    }
    if (session.output) {
      store.appendMessage(sid, {
        id: `msg_${Date.now()}_a_${Math.random().toString(36).slice(2, 4)}`,
        type: 'ai',
        content: session.output,
        timestamp: getCurrentTime(),
      });
    }
    if (session.error) {
      store.appendMessage(sid, {
        id: `msg_${Date.now()}_e_${Math.random().toString(36).slice(2, 4)}`,
        type: 'system',
        content: `历史错误: ${session.error}`,
        timestamp: getCurrentTime(),
      });
    }
  };

  const handleSelectSession = async (session: SessionMeta) => {
    if (!session.mode) return;
    // 一会话三模式：选会话 = 同页切换（不再跳路由），组件不卸载、
    // 在播的流不中断；mode 仅表示该会话的末次执行策略。
    setMode(session.mode as TaskMode);
    // 同一会话已有任务条目：直接激活，避免重复条目与重复回放流（状态卡片会重复）。
    // 但空壳条目（一条消息都没有且不在加载中）说明上次回放/渲染失败，删掉重新回放
    const existingTask = store.getTask(session.id);
    if (existingTask && (existingTask.messages.length > 0 || existingTask.loading)) {
      store.setActiveSession(session.id);
      return;
    }
    if (selectInFlightRef.current.has(session.id)) {
      // 上一轮选择正在拉取历史轮次：直接激活其条目，避免并发重建出重复回放
      store.setActiveSession(session.id);
      return;
    }
    if (existingTask) store.removeTask(session.id);
    selectInFlightRef.current.add(session.id);
    const sid = store.createTask(session.mode as TaskMode, session.role || 'chief_designer', session.requirement || '', session.id);
    store.setActiveSession(sid);

    // 多轮回放：拉取更早轮次的用户/助手消息对并播种。最新一轮不在此播种——
    // 它由下方 requirement 播种 + pendingHydration 事件流回放负责，二者拼成完整历史。
    // 拉取失败只降级为旧的单轮回放，不阻断会话切换。
    let earlierTurns: SessionTurn[] = [];
    try {
      const { turns } = await getSessionTurns(session.id);
      earlierTurns = turns.filter((turn) => turn.executionId !== session.executionId);
    } catch {
      // 历史轮次接口不可用：退回单轮回放
    }
    selectInFlightRef.current.delete(session.id);
    if (!store.getTask(sid)) return; // 等待期间条目被删（如会话被清），放弃播种
    const turnTime = (iso: string) => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? new Date(ms).toTimeString().split(' ')[0] : getCurrentTime();
    };
    for (const turn of earlierTurns) {
      store.appendMessage(sid, {
        id: `msg_u_${turn.executionId}`,
        type: 'user',
        content: turn.requirement,
        timestamp: turnTime(turn.createdAt),
      });
      if (turn.output) {
        store.appendMessage(sid, {
          id: `msg_a_${turn.executionId}`,
          type: 'ai',
          content: turn.output,
          timestamp: turnTime(turn.createdAt),
        });
      } else if (turn.error) {
        store.appendMessage(sid, {
          id: `msg_e_${turn.executionId}`,
          type: 'system',
          content: `历史执行失败（${turn.status}）: ${turn.error.slice(0, 120)}`,
          timestamp: turnTime(turn.createdAt),
        });
      } else {
        store.appendMessage(sid, {
          id: `msg_e_${turn.executionId}`,
          type: 'system',
          content: `该轮执行无产出记录（${turn.status}）`,
          timestamp: turnTime(turn.createdAt),
        });
      }
    }

    // 用户消息：执行事件流里只有 agent 侧事件，回放不会重建用户气泡，
    // 用会话的 requirement 播种
    if (session.requirement) {
      store.appendMessage(sid, {
        id: `msg_u_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        type: 'user',
        content: session.requirement,
        timestamp: getCurrentTime(),
      });
    }

    if (session.executionId) {
      pendingSessionMetaRef.current.set(sid, session);
      // 历史回放走 pendingHydration 标记：由挂载中的本页面的 consume-effect
      // 接手开播（事件回调与 hydratingSessionsRef 门控保持同一套机制）。
      store.updateTask(sid, {
        executionId: session.executionId,
        loading: true,
        statusText: '正在加载历史执行记录…',
        pendingHydration: session.executionId,
        streamResumeAttempts: 0,
      });
      return;
    }

    appendSessionSummary(sid, session);
  };

  const handleInputKeydown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAutoResize = (textarea: HTMLTextAreaElement) => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
  };

  const messages = task?.messages || [];
  const streaming = task?.streaming || false;
  const streamingText = task?.streamingText || '';
  const loading = task?.loading || false;
  const timeline = task?.timeline || [];
  const logs = task?.logs || [];
  const knowledgeSources = task?.knowledgeSources || [];
  const sessionId = task?.sessionId || null;
  const status = task?.status || 'idle';
  const statusText = task?.statusText || '就绪';
  const executionTime = task?.executionTime || '0:00';
  const messageCount = messages.length;

  return (
    <div className="h-screen w-screen flex flex-col bg-paper overflow-hidden">
      <Header
        mode={mode}
        modeSwitchDisabled={task?.loading ?? false}
        onModeChange={(newMode) => {
          // 同页切换执行策略：不卸载组件、不断流；URL 仅作书签/刷新回显
          setMode(newMode);
          router.replace(`/design?mode=${newMode}`, { scroll: false });
        }}
        role={effectiveRole}
        onRoleChange={setPendingRole}
        roleLocked={roleLocked}
        status={status}
        statusText={statusText}
        onNewChat={handleNewChat}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
        onOpenSettings={() => { setIsFirstTimeSetup(false); setShowSetupModal(true); }}
      />

      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Left: Session Sidebar */}
        <SessionSidebar
          selectedId={sessionId}
          onSelect={handleSelectSession}
          onNew={handleNewChat}
          refreshTick={refreshTick}
        />

        {/* Center: Chat Area */}
        <div className="flex flex-col min-w-0 bg-paper border-r border-ink/8" style={{ flex: dialogFlex, minWidth: 380 }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <WelcomeScreen mode={mode} role={effectiveRole} onExampleClick={(text) => setRequirement(text)} />
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} msg={msg} sessionId={sessionId} role={effectiveRole} executionId={task?.executionId ?? null} />
                ))}
                {streaming && (
                  streamingText ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-3"
                    >
                      <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-coral text-white">
                        <Bot size={14} />
                      </div>
                      <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed bg-white border border-ink/6 text-ink overflow-x-auto">
                        <div className="markdown-content">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                        </div>
                        <span className="inline-block w-1.5 h-4 bg-coral/60 animate-pulse ml-0.5 align-text-bottom" />
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-ink/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
                      AI 正在思考…
                    </div>
                  )
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-ink/6 px-4 py-3">
            {task?.status === 'waiting' && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-coral/20 bg-coral/5 px-4 py-2.5">
                <div className="text-xs text-ink/70">
                  执行已暂停，等待人工审阅
                  {task.hitlCheckpointId ? (
                    <span className="ml-1 text-ink/40">· {task.hitlCheckpointId.slice(0, 8)}…</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setHitlModalOpen(true)}
                  className="shrink-0 rounded-lg bg-coral px-3 py-1.5 text-xs font-medium text-white hover:bg-coral/90"
                >
                  打开审阅
                </button>
              </div>
            )}
            <div className="max-w-none mx-0">
              <div className="rounded-xl border border-ink/8 bg-white shadow-sm">
                <textarea
                  value={requirement}
                  onChange={(e) => {
                    setRequirement(e.target.value);
                    handleAutoResize(e.target);
                  }}
                  onKeyDown={handleInputKeydown}
                  placeholder={
                    mode === 'query'
                      ? '输入您想查询的知识内容，如：什么是角色养成系统？'
                      : mode === 'table'
                      ? '输入配表需求，如：根据策划案完成配表...'
                      : '输入您的游戏设计需求，按 Enter 发送，Shift+Enter 换行...'
                  }
                  rows={1}
                  disabled={loading}
                  className="w-full resize-none bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:outline-none disabled:opacity-50"
                />
                <div className="flex items-center justify-between px-3 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseStream(!useStream)}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        useStream ? 'bg-coral/10 text-coral' : 'bg-ink/5 text-ink/50'
                      }`}
                    >
                      <Zap size={10} />
                      {useStream ? '流式' : '非流式'}
                    </button>
                    <span className="text-[10px] text-ink/40 hidden sm:inline">Enter 发送，Shift+Enter 换行</span>
                  </div>
                  {loading ? (
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1.5 rounded-lg bg-ink/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink/30 transition-colors"
                    >
                      <Loader2 size={14} className="animate-spin" />
                      取消
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={!requirement.trim()}
                      className="flex items-center gap-1.5 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send size={14} />
                      发送
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resizable splitter */}
        {rightPanelOpen && (
          <div
            className="w-2 shrink-0 cursor-col-resize bg-ink/5 hover:bg-coral/30 active:bg-coral/40 transition-colors flex items-center justify-center group"
            onMouseDown={() => {
              isDraggingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            title="拖动调整宽度"
          >
            <div className="w-0.5 h-8 rounded-full bg-ink/20 group-hover:bg-coral/60 transition-colors" />
          </div>
        )}

        {/* Right: Monitor Panel */}
        {rightPanelOpen && (
          <div className="flex flex-col min-w-0" style={{ flex: monitorFlex, minWidth: 320 }}>
            <RightPanel
              timeline={timeline}
              logs={logs}
              knowledgeSources={knowledgeSources}
              sessionId={sessionId}
              messageCount={messageCount}
              executionTime={executionTime}
              onClearLogs={() => {
                if (activeSessionId) store.updateTask(activeSessionId, { logs: [] });
              }}
              activeTab={rightPanelTab}
              onChangeTab={setRightPanelTab}
            />
          </div>
        )}
      </div>

      {/* Setup Modal */}
      <SetupModal
        open={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onConfigured={() => { setShowSetupModal(false); setIsFirstTimeSetup(false); }}
        isFirstTime={isFirstTimeSetup}
      />

      <HitlReviewModal
        open={hitlModalOpen}
        checkpointId={task?.hitlCheckpointId ?? null}
        fallbackContent={hitlFallbackContent}
        onClose={() => setHitlModalOpen(false)}
        onReviewed={handleHitlReviewed}
      />
    </div>
  );
}

const ChatBubble = React.memo(function ChatBubble({
  msg,
  sessionId,
  role,
  executionId,
}: {
  msg: ChatMessage;
  sessionId: string | null;
  role: string;
  executionId: string | null;
}) {
  if (msg.type === 'system') {
    return (
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink/10 text-[11px] text-ink/60">
          <Info size={12} />
          {msg.content}
          <span className="text-ink/40">{msg.timestamp}</span>
        </div>
      </div>
    );
  }

  const isUser = msg.type === 'user';
  const showDownload = !isUser && sessionId && role !== 'chief_designer' && msg.content.length > 0;
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    if (isUser) return;
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // 用户明确复制结果 → 观测台在线评测采样信号（flywheel 03-P4）
    reportUserSignal({ kind: 'copied', sessionId, executionId });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg ${
        isUser ? 'bg-ink/15 text-ink/70' : 'bg-coral text-white'
      }`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed overflow-x-auto ${
        isUser ? 'bg-coral text-white' : 'bg-white border border-ink/6 text-ink'
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{msg.content}</div>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <div className={`text-[10px] ${isUser ? 'text-white/60' : 'text-ink/50'}`}>
            {msg.timestamp}
          </div>
          <div className="flex items-center gap-2">
            {!isUser && (
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] text-ink/60 hover:text-coral"
              >
                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                {copied ? '已复制' : '复制'}
              </button>
            )}
            {showDownload && (
              <a
                href={`/api/sessions/${sessionId}/files/download?path=${encodeURIComponent('single/output.md')}`}
                download
                className="flex items-center gap-1 text-[10px] text-ink/60 hover:text-coral"
              >
                <Download size={12} />
                下载
              </a>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});
ChatBubble.displayName = 'ChatBubble';

const EXAMPLES = [
  { emoji: '🃏', title: '卡牌对战游戏', text: '设计一个卡牌对战游戏，包含英雄系统、卡牌系统、战斗系统、成长系统和PVP对战。' },
  { emoji: '🌱', title: '放置养成游戏', text: '设计一个放置养成类游戏，包含角色养成、挂机系统、关卡推进、资源系统和社交系统。' },
  { emoji: '⚔️', title: 'MOBA竞技游戏', text: '设计一个5v5 MOBA竞技游戏，包含英雄系统、技能系统、装备系统、地图系统和匹配系统。' },
  { emoji: '🔍', title: '查询知识库', text: '什么是角色养成系统？' },
];

const WelcomeScreen = memo(function WelcomeScreen({ mode, role, onExampleClick }: {
  mode: string;
  role: string;
  onExampleClick: (text: string) => void;
}) {
  const roleNames: Record<string, string> = {
    chief_designer: '主策划',
    system_designer: '系统策划',
    combat_designer: '战斗策划',
    numerical_planner: '数值策划',
    gameplay_designer: '玩法策划',
    executive_planner: '执行策划',
    qa_planner: 'QA 策划',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full text-center px-4"
    >
      <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-coral text-white mb-4">
        <Sparkles size={24} />
      </div>
      <h2 className="text-xl font-bold text-ink mb-1">游戏策划 AI 助手</h2>
      <div className="mb-3 px-3 py-1 rounded-full bg-coral/10 text-coral text-xs font-medium">
        {roleNames[role] || role}
      </div>
      <p className="text-sm text-ink/60 mb-1 max-w-sm">
        {mode === 'query'
          ? '输入您想查询的知识内容，AI 将为您检索游戏策划相关知识。'
          : mode === 'table'
          ? '输入配表需求，AI 将为您生成游戏配置表格。'
          : '输入您的游戏设计需求，AI 将为您生成完整的策划方案。'}
      </p>
      <p className="text-xs text-ink/40 mb-6 max-w-sm">
        顶部可随时切换执行策略（策划生成 / 知识查询 / 配表工具），对下一条消息生效，会话上下文全程保留。
      </p>

      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.title}
            onClick={() => onExampleClick(ex.text)}
            className="flex items-center gap-2 rounded-xl border border-ink/6 bg-white px-3 py-2.5 text-left hover:border-coral/20 hover:shadow-sm transition-all"
          >
            <span className="text-lg">{ex.emoji}</span>
            <span className="text-xs font-medium text-ink">{ex.title}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
});
WelcomeScreen.displayName = 'WelcomeScreen';
