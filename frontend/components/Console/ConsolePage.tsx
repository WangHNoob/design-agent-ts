'use client';

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Loader2, Zap, User, Bot, Info, Download, Copy, Check, BookOpen, Scissors } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import Header from '@/components/Console/Header';
import SessionSidebar from '@/components/Console/SessionSidebar';
import RightPanel from '@/components/Console/RightPanel';
import { ProgressCard } from '@/components/Console/ProgressCard';
import { reportUserSignal } from '@/lib/userSignals';
import SetupModal from '@/components/Console/SetupModal';
import DemoChoiceModal from '@/components/Console/DemoChoiceModal';
import HitlReviewModal from '@/components/Console/HitlReviewModal';
import { useAuth } from '@/components/AuthProvider';
import { executeDesign, executeDesignStream, resumeExecutionStream, getExecution, getConfigStatus, listHITLCheckpoints, getSessionTurns, compactSession, getSessionContext, getDemoStatus, type DemoStatus, type SessionContextUsageInfo, type SessionMeta, type SessionTurn, type StreamHandle } from '@/lib/api';
import { useTaskStore, type TaskMode, type ChatMessage, type KnowledgeSource } from '@/lib/stores/taskStore';
import { handleStreamEvent, resetTaskTracking, dedupeSources } from '@/lib/streamHandler';
import ModePicker from '@/components/Console/ModePicker';
import { MODE_META, MODE_ORDER, normalizeMode } from '@/lib/modes';

// react-markdown + remark-gfm 较重且欢迎态/流式占位用不到：按需加载，
// 不进控制台首屏关键路径（bundle-dynamic-imports）
const Markdown = dynamic(() => import('./Markdown'), { ssr: false });

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

export default function ConsolePage({ initialMode }: Props) {
  const router = useRouter();
  // 订阅切片而非整个 store：整仓订阅会让任意任务（含后台执行的日志/计时器）
  // 的每次 set() 都重渲染这 1300 行的控制台壳（rerender-defer-reads）。
  // 方法引用在 create() 中定义一次、永远稳定，经 useShallow 组合只在
  // activeSessionId 变化时改变身份。
  const activeSessionId = useTaskStore((s) => s.activeSessionId);
  // 仅订阅"当前激活任务"对象：流式 chunk / 本任务计时器仍会触发渲染
  //（界面上就是要显示它们），但后台会话的更新不再波及本页。
  const task = useTaskStore((s) => (s.activeSessionId ? s.tasks.get(s.activeSessionId) : undefined));
  const store = useTaskStore(useShallow((s) => ({
    activeSessionId: s.activeSessionId,
    getTask: s.getTask,
    updateTask: s.updateTask,
    appendMessage: s.appendMessage,
    appendTimeline: s.appendTimeline,
    appendLog: s.appendLog,
    setStreamRef: s.setStreamRef,
    setActiveSession: s.setActiveSession,
    cancelTask: s.cancelTask,
    removeTask: s.removeTask,
    createTask: s.createTask,
  })));

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
  // 演示模式：访客首次进入弹"免费额度 / 配置自己的 Key"选择（localStorage 记忆）
  const { user, isDemoUser } = useAuth();
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoStatus, setDemoStatus] = useState<DemoStatus | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [hitlModalOpen, setHitlModalOpen] = useState(false);
  const [hitlFallbackContent, setHitlFallbackContent] = useState<string | undefined>();
  // 已向用户展示过的 HITL 检查点（按会话）：批准后的状态翻转有延迟、断线
  // 重连会回放 waiting_hitl 事件、轮询每个周期都会跑——没有这层去重，
  // 同一个检查点会被反复弹出（实测连续弹多次后才停）
  const surfacedHitlRef = useRef<Map<string, Set<string>>>(new Map());

  const markHitlSurfaced = useCallback((sessionId: string, checkpointId: string) => {
    let surfaced = surfacedHitlRef.current.get(sessionId);
    if (!surfaced) {
      surfaced = new Set<string>();
      surfacedHitlRef.current.set(sessionId, surfaced);
    }
    surfaced.add(checkpointId);
  }, []);

  /** HITL 弹窗唯一入口：检查点已展示过（含已批准确认/用户手动关闭）就不再弹。
   *  手动重开走顶部状态条按钮。 */
  const maybeOpenHitlModal = useCallback((sessionId: string, checkpointId?: string | null) => {
    const id = checkpointId ?? store.getTask(sessionId)?.hitlCheckpointId ?? null;
    if (id) {
      const surfaced = surfacedHitlRef.current.get(sessionId);
      if (surfaced?.has(id)) return;
      markHitlSurfaced(sessionId, id);
      store.updateTask(sessionId, { hitlCheckpointId: id });
    }
    setHitlModalOpen(true);
  }, [store, markHitlSurfaced]);

  // Check config status on mount
  useEffect(() => {
    getConfigStatus()
      .then((status) => {
        // 全局 API Key 引导只对管理员弹——演示/普通用户改不了全局配置，
        // 他们的引导入口是 DemoChoiceModal / 设置页 BYOK 卡片
        if (status.needsApiKey && user?.role === 'admin') {
          setShowSetupModal(true);
          setIsFirstTimeSetup(true);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // 演示访客：首次进入弹选择弹窗并拉取额度状态；之后定期刷新额度
  useEffect(() => {
    if (!isDemoUser) return;
    let seen = true;
    try { seen = localStorage.getItem('demo-choice-seen') === '1'; } catch { seen = true; }
    getDemoStatus().then(setDemoStatus).catch(() => {});
    if (!seen) setDemoModalOpen(true);
  }, [isDemoUser]);

  useEffect(() => {
    if (!isDemoUser) return;
    const timer = setInterval(() => {
      getDemoStatus().then(setDemoStatus).catch(() => {});
    }, 30_000);
    return () => clearInterval(timer);
  }, [isDemoUser]);

  const closeDemoModal = useCallback(() => {
    setDemoModalOpen(false);
    try { localStorage.setItem('demo-choice-seen', '1'); } catch { /* 隐私模式忽略 */ }
  }, []);

  const formatTokens = useCallback((n?: number) => {
    if (n === undefined || n === null) return '';
    return n >= 10000 ? `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}万` : String(n);
  }, []);

  const identityChip = user
    ? {
        isDemo: isDemoUser,
        label: isDemoUser ? '演示模式' : user.role === 'admin' ? '管理员' : (user.name || '成员'),
        quota: isDemoUser && demoStatus?.quotaEnabled
          ? `今日额度 ${formatTokens(demoStatus.usedToday ?? 0)}/${formatTokens(demoStatus.limit)} tokens`
          : undefined,
        onClick: isDemoUser ? () => setDemoModalOpen(true) : undefined,
      }
    : null;

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
        const surfacedHitl = surfacedHitlRef.current.get(task.sessionId);
        const currentCheckpointId = store.getTask(task.sessionId)?.hitlCheckpointId;
        if (currentCheckpointId) {
          if (!surfacedHitl?.has(currentCheckpointId)) {
            maybeOpenHitlModal(task.sessionId, currentCheckpointId);
          }
        } else {
          listHITLCheckpoints(task.sessionId)
            .then((res) => {
              const pending = res.checkpoints.find(
                (cp) => cp.status === 'waiting_review' || cp.status === 'escalated',
              );
              if (pending) {
                maybeOpenHitlModal(task.sessionId, pending.id);
              }
            })
            .catch(() => {});
        }
        setRefreshTick((t) => t + 1);
        return;
      }
      if (!TERMINAL_EXECUTION_STATUSES.has(execution.status)) return;
      const output = typeof execution.output === 'string' ? execution.output
        : typeof execution.result === 'string' ? execution.result
        : null;
      if (output) {
        // 与 streamHandler complete 分支相同的确定性 ID：完成消息由 SSE、
        // 轮询兜底、刷新回放三条路径追加，store.appendMessage 按 ID 幂等去重。
        store.appendMessage(task.sessionId, {
          id: `msg_final_${execution.id}`,
          type: 'ai',
          content: output,
          timestamp: getCurrentTime(),
          mode: task.mode,
        });
      }
      if (execution.errorMessage) {
        store.appendMessage(task.sessionId, {
          id: `msg_final_err_${execution.id}`,
          type: 'system',
          content: `执行结束（${execution.status}）: ${execution.errorMessage}`,
          timestamp: getCurrentTime(),
        });
      } else if (execution.status === 'failed') {
        store.appendMessage(task.sessionId, {
          id: `msg_final_err_${execution.id}`,
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
      // handleStreamEvent 需要完整 store：方法引用永远稳定，直接取实时快照
      handleStreamEvent(sessionId, event, data, useTaskStore.getState());

      // 历史回放门控：重放期间 HITL 弹窗延迟判定（静默 1.5s 视为回放结束，
      // 若最终状态是 waiting 才弹窗——说明该检查点确实还在等人工审阅）
      if (hydratingSessionsRef.current.has(sessionId)) {
        const finishHydration = () => {
          hydratingSessionsRef.current.delete(sessionId);
          const t = store.getTask(sessionId);
          store.updateTask(sessionId, { loading: false, streaming: false });
          if (t?.status === 'waiting') maybeOpenHitlModal(sessionId);
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
        if (!hydratingSessionsRef.current.has(sessionId)) {
          maybeOpenHitlModal(sessionId, typeof d.checkpointId === 'string' ? d.checkpointId : null);
        }
      }

      if (event === 'execution_status') {
        const d = data as Record<string, unknown>;
        if (d.status === 'waiting_hitl') {
          const checkpointId = d.checkpointId as string | undefined;
          if (checkpointId) {
            store.updateTask(sessionId, { hitlCheckpointId: checkpointId });
          }
          if (!hydratingSessionsRef.current.has(sessionId)) {
            maybeOpenHitlModal(sessionId, checkpointId ?? null);
          }
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
    // 已处置的检查点：轮询/回放都不再为它弹窗
    markHitlSurfaced(sid, result.checkpoint.id);
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
      mode,
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
        // @/lib/api 本就静态引入，这里再 dynamic import 是假代码分割
        const res = await executeDesign({ requirement: reqText, mode, role: effectiveRole, sessionId: sid, history });
        if (mountedRef.current) {
          if (res.success && res.output) {
            store.appendMessage(sid, {
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
              type: 'ai',
              content: res.output,
              timestamp: getCurrentTime(),
              mode,
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

  const [compactBusy, setCompactBusy] = useState(false);

  // 会话上下文用量：执行中每 5s 轮询（LLM 每次调用的真实 input tokens），
  // 切会话/执行结束刷新一次
  const [contextUsage, setContextUsage] = useState<SessionContextUsageInfo | null>(null);
  useEffect(() => {
    const sid = activeSessionId;
    if (!sid) {
      setContextUsage(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      getSessionContext(sid)
        .then((d) => { if (!cancelled) setContextUsage(d); })
        .catch(() => {});
    };
    refresh();
    const timer = task?.loading ? setInterval(refresh, 5000) : null;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [activeSessionId, task?.loading]);

  const handleCompactContext = useCallback(async () => {
    const sid = activeSessionId;
    if (!sid || compactBusy) return;
    setCompactBusy(true);
    try {
      const res = await compactSession(sid);
      store.appendMessage(sid, {
        id: `msg_compact_${Date.now()}`,
        type: 'system',
        content: `已把本会话 ${res.compactedTurns} 轮历史压缩为上下文摘要，后续执行将自动携带。`,
        timestamp: getCurrentTime(),
      });
      getSessionContext(sid).then((d) => setContextUsage(d)).catch(() => {});
    } catch (err) {
      store.appendMessage(sid, {
        id: `msg_compact_err_${Date.now()}`,
        type: 'system',
        content: `压缩失败：${err instanceof Error ? err.message.slice(0, 120) : '未知错误'}`,
        timestamp: getCurrentTime(),
      });
    } finally {
      setCompactBusy(false);
    }
  }, [activeSessionId, compactBusy, store]);

  const handleNewChat = () => {
    store.setActiveSession(null);
    setRequirement('');
  };

  // 稳定回调：传给 memo 化的 WelcomeScreen / ModePicker / ChatBubble，
  // 否则每次渲染（含每个流式 chunk）都会击穿 memo（rerender-memo 系列）
  const handleModeChange = useCallback((newMode: TaskMode) => {
    // 同页切换执行策略：不卸载组件、不断流；URL 仅作书签/刷新回显
    setMode(newMode);
    router.replace(`/design?mode=${newMode}`, { scroll: false });
  }, [router]);

  const handleExampleClick = useCallback((text: string, m: TaskMode) => {
    handleModeChange(m);
    setRequirement(text);
  }, [handleModeChange]);

  const openEvidence = useCallback(() => setRightPanelTab('knowledge'), []);

  const appendSessionSummary = (sid: string, session: SessionMeta) => {
    // 无执行记录时的兜底：用会话摘要拼一个只读视图
    if (session.requirement) {
      store.appendMessage(sid, {
        id: `msg_${Date.now()}_u_${Math.random().toString(36).slice(2, 4)}`,
        type: 'user',
        content: session.requirement,
        timestamp: getCurrentTime(),
        mode: session.mode,
      });
    }
    if (session.output) {
      store.appendMessage(sid, {
        id: `msg_${Date.now()}_a_${Math.random().toString(36).slice(2, 4)}`,
        type: 'ai',
        content: session.output,
        timestamp: getCurrentTime(),
        mode: session.mode,
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
    // URL 书签与手动切换行为一致（replace 不产生历史记录）
    router.replace(`/design?mode=${session.mode}`, { scroll: false });
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
    // 历史轮次的证据并入任务（证据面板去重展示），并随消息记录本轮来源
    const replaySources: KnowledgeSource[] = [];
    for (const turn of earlierTurns) {
      store.appendMessage(sid, {
        id: `msg_u_${turn.executionId}`,
        type: 'user',
        content: turn.requirement,
        timestamp: turnTime(turn.createdAt),
        mode: turn.mode ?? undefined,
      });
      if (turn.output) {
        const turnSources = dedupeSources(turn.knowledgeSources ?? []);
        if (turnSources.length > 0) replaySources.push(...turnSources);
        store.appendMessage(sid, {
          id: `msg_a_${turn.executionId}`,
          type: 'ai',
          content: turn.output,
          timestamp: turnTime(turn.createdAt),
          mode: turn.mode ?? undefined,
          sources: turnSources.length > 0 ? turnSources : undefined,
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

    // 历史证据并入任务级列表（证据面板按 type:id 去重展示）
    if (replaySources.length > 0) {
      const task = store.getTask(sid);
      store.updateTask(sid, {
        knowledgeSources: dedupeSources([...(task?.knowledgeSources ?? []), ...replaySources]),
      });
    }

    // 用户消息：执行事件流里只有 agent 侧事件，回放不会重建用户气泡，
    // 用会话的 requirement 播种
    if (session.requirement) {
      store.appendMessage(sid, {
        id: `msg_u_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
        type: 'user',
        content: session.requirement,
        timestamp: getCurrentTime(),
        mode: session.mode,
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
        role={effectiveRole}
        onRoleChange={setPendingRole}
        roleLocked={roleLocked}
        status={status}
        statusText={statusText}
        onNewChat={handleNewChat}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
        onOpenSettings={() => { router.push('/settings'); }}
        identityChip={identityChip}
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
              <WelcomeScreen
                mode={mode}
                role={effectiveRole}
                onExampleClick={handleExampleClick}
                onModeChange={handleModeChange}
              />
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} msg={msg} sessionId={sessionId} role={effectiveRole} executionId={task?.executionId ?? null} onOpenEvidence={openEvidence} />
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
                          <Markdown>{streamingText}</Markdown>
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
                      ? '询问游戏规则或文档内容，如：核心战斗规则是什么？'
                      : mode === 'table'
                      ? '输入配表需求，如：参考现有结构为新玩法完成配表...'
                      : '描述玩法需求，AI 将结合知识库产出初版策划案...'
                  }
                  rows={1}
                  disabled={loading}
                  className="w-full resize-none bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink/40 focus:outline-none disabled:opacity-50"
                />
                <div className="flex items-center justify-between px-3 pb-2">
                  <div className="flex items-center gap-2">
                    <ModePicker mode={mode} disabled={loading} onChange={handleModeChange} />
                    {(() => {
                      const tokens = contextUsage?.tokens ?? null;
                      if (!tokens) return null;
                      const budget = contextUsage?.budget ?? null;
                      const ratio = budget ? Math.min(1, tokens / budget) : 0;
                      const fmt = (n: number) => `${Math.round(n / 1000)}K`;
                      const barColor = !budget
                        ? 'bg-ink/30'
                        : ratio >= 0.8 ? 'bg-red-500' : ratio >= 0.6 ? 'bg-amber-400' : 'bg-emerald-500';
                      return (
                        <div
                          className="flex items-center gap-1.5 rounded-md bg-ink/5 px-2 py-1"
                          title={`当前会话上下文用量（模型实际收到的 tokens）${contextUsage?.model ? ` · 模型 ${contextUsage.model}` : ''}${budget ? ` · 到达 ${fmt(budget)} 时自动压缩` : ''}`}
                        >
                          <span className="text-[10px] text-ink/50">上下文 {fmt(tokens)}{budget ? `/${fmt(budget)}` : ''}</span>
                          {budget ? (
                            <span className="inline-block h-1 w-10 overflow-hidden rounded-full bg-ink/10">
                              <span className={`block h-full ${barColor}`} style={{ width: `${Math.max(3, Math.round(ratio * 100))}%` }} />
                            </span>
                          ) : null}
                          {budget && ratio >= 0.8 ? <span className="text-[10px] text-red-500">建议压缩</span> : null}
                        </div>
                      );
                    })()}
                    <button
                      onClick={handleCompactContext}
                      disabled={loading || !activeSessionId || compactBusy}
                      title="把本会话历史压缩为上下文摘要，后续执行自动携带（腾出上下文空间）"
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        'bg-ink/5 text-ink/50 hover:bg-ink/10 hover:text-ink'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {compactBusy ? <Loader2 size={10} className="animate-spin" /> : <Scissors size={10} />}
                      压缩上下文
                    </button>
                    <button
                      onClick={() => setUseStream(!useStream)}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        useStream ? 'bg-coral/10 text-coral' : 'bg-ink/5 text-ink/50'
                      }`}
                    >
                      <Zap size={10} />
                      {useStream ? '流式' : '非流式'}
                    </button>
                    <span className="text-[10px] text-ink/40 hidden lg:inline">Enter 发送，Shift+Enter 换行</span>
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

      {/* 演示访客选择弹窗：免费额度 / 配置自己的 Key / 主人登录 */}
      <DemoChoiceModal
        open={demoModalOpen}
        onClose={closeDemoModal}
        status={demoStatus}
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
  onOpenEvidence,
}: {
  msg: ChatMessage;
  sessionId: string | null;
  role: string;
  executionId: string | null;
  /** 点击引用徽标时切换右侧面板到「证据」tab */
  onOpenEvidence?: () => void;
}) {
  // Hooks 规则：必须在任何条件 return 之前调用（此前在 system 早退之后，
  // 渲染分支变化时会触发 React Hooks 顺序错误）
  const [copied, setCopied] = React.useState(false);

  // 任务进度卡片：plan 时锚定的单条消息，状态由 ProgressCard 自订阅
  // timeline 按 taskId 原地更新，一个执行只占一个消息位
  if (msg.type === 'progress') {
    if (!sessionId || !msg.progress?.tasks?.length) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-3"
      >
        <div className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-coral text-white">
          <Bot size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <ProgressCard sessionId={sessionId} tasks={msg.progress.tasks} />
        </div>
      </motion.div>
    );
  }

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
            <Markdown>{msg.content}</Markdown>
          </div>
        )}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            {/* 产出模式徽标：会话内混用策略的直接证据；旧消息无 mode 不渲染 */}
            {!isUser && msg.mode && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${MODE_META[msg.mode].chipClass}`}
              >
                <span className={`w-1 h-1 rounded-full ${MODE_META[msg.mode].dotClass}`} />
                {MODE_META[msg.mode].label}
              </span>
            )}
            {/* 引用证据徽标：本轮 WeKnora 检索命中的文档数；点击跳右侧「证据」面板 */}
            {!isUser && msg.sources && msg.sources.length > 0 && (
              <button
                type="button"
                onClick={onOpenEvidence}
                title={msg.sources.map((s) => s.title || s.id).join('\n')}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-teal-700 bg-teal-500/10 hover:bg-teal-500/20"
              >
                <BookOpen size={10} />
                引用 {msg.sources.length} 篇知识库文档
              </button>
            )}
            <span className={`text-[10px] ${isUser ? 'text-white/60' : 'text-ink/50'}`}>
              {msg.timestamp}
            </span>
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

// 示例卡：面向既有游戏产品的策划工作流（新人上手查规则 → 出初版策划案 → 配表），
// 不是从 0 构建新游戏。点击 = 切到对应执行策略 + 填入需求。
const EXAMPLES: Array<{ emoji: string; title: string; text: string; mode: TaskMode }> = [
  { emoji: '📘', title: '快速了解核心规则', text: '这个游戏的核心战斗规则和核心玩法循环是什么？', mode: 'query' },
  { emoji: '🌿', title: '梳理养成系统', text: '角色养成线包含哪些系统？各自的成长节奏和产出途径是怎样的？', mode: 'query' },
  { emoji: '📝', title: '出一份初版策划案', text: '结合知识库中的现有系统，为「好友助战」玩法输出一份初版策划案（目标、规则、系统框架）。', mode: 'design' },
  { emoji: '📊', title: '为新玩法配表', text: '参考知识库中的现有配表结构，为「好友助战」玩法完成配置表。', mode: 'table' },
];

const WelcomeScreen = memo(function WelcomeScreen({ mode, role, onExampleClick, onModeChange }: {
  mode: TaskMode;
  role: string;
  onExampleClick: (text: string, mode: TaskMode) => void;
  onModeChange: (mode: TaskMode) => void;
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
      {/* 三模式 pill：空状态即第一次触达点，点击直接切换执行策略 */}
      <div className="mb-3 flex items-center gap-2">
        {MODE_ORDER.map((id) => {
          const meta = MODE_META[id];
          const active = id === mode;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              title={meta.description}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? `${meta.chipClass} border-transparent`
                  : 'border-ink/8 bg-white text-ink/50 hover:border-ink/20'
              }`}
            >
              <meta.icon size={12} />
              {meta.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-ink/60 mb-1 max-w-sm">
        {mode === 'query'
          ? '询问游戏规则、系统或文档内容，AI 基于知识库直接回答，帮新策划快速上手。'
          : mode === 'table'
          ? '描述配表需求，AI 参考知识库与现有表结构生成配置表。'
          : '描述玩法需求，AI 结合知识库中既有系统为您产出初版策划案。'}
      </p>
      <p className="text-xs text-ink/40 mb-6 max-w-sm">
        同一会话内可随时切换执行策略（输入框左下角），对下一条消息生效，会话上下文全程保留。
      </p>

      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
        {EXAMPLES.map((ex) => {
          const meta = MODE_META[ex.mode];
          return (
            <button
              key={ex.title}
              onClick={() => onExampleClick(ex.text, ex.mode)}
              className="flex items-center gap-2 rounded-xl border border-ink/6 bg-white px-3 py-2.5 text-left hover:border-coral/20 hover:shadow-sm transition-all"
            >
              <span className="text-lg">{ex.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-ink">{ex.title}</span>
                <span className={`mt-0.5 inline-flex items-center gap-0.5 text-[9px] font-medium ${meta.textClass}`}>
                  <meta.icon size={9} />
                  {meta.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
});
WelcomeScreen.displayName = 'WelcomeScreen';
