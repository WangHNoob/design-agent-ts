'use client';

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Loader2, Zap, User, Bot, Info, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';
import Header from '@/components/Console/Header';
import SessionSidebar from '@/components/Console/SessionSidebar';
import RightPanel from '@/components/Console/RightPanel';
import type { TimelineEntry } from '@/components/Console/StepsTimeline';
import type { DetailedLog } from '@/components/Console/DetailedLogs';
import ResultPanel from '@/components/Console/ResultPanel';
import SetupModal from '@/components/Console/SetupModal';
import { executeDesignStream, getConfigStatus, type SessionMeta } from '@/lib/api';
import { useTaskStore, type TaskMode, type ChatMessage } from '@/lib/stores/taskStore';
import { handleStreamEvent, resetTaskTracking } from '@/lib/streamHandler';

interface Props {
  mode: TaskMode;
}

function getCurrentTime() {
  return new Date().toTimeString().split(' ')[0];
}

export default function ConsolePage({ mode }: Props) {
  const router = useRouter();
  const store = useTaskStore();
  const activeSessionId = store.activeSessionByMode[mode];
  const task = activeSessionId ? store.getTask(activeSessionId) : undefined;

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
  const [rightPanelTab, setRightPanelTab] = useState<'steps' | 'logs' | 'files'>('steps');
  const [useStream, setUseStream] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

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
      handleStreamEvent(sessionId, event, data, store);

      // Scroll on chunk
      if (event === 'chunk') {
        if (!streamingRafRef.current) {
          streamingRafRef.current = requestAnimationFrame(() => {
            scrollToBottom();
            streamingRafRef.current = null;
          });
        }
      }

      if (event === 'complete') {
        const taskRole = store.getTask(sessionId)?.role;
        if (taskRole === 'chief_designer') {
          setRightPanelTab('files');
        }
      }

      if (event === 'complete' || event === 'error') {
        setRefreshTick((t) => t + 1);
      }
    },
    [store]
  );

  const handleSubmit = async () => {
    if (!requirement.trim()) return;
    if (task?.loading) return;

    // For query mode, reuse the active session so the conversation continues.
    // For design/table mode, each run is a fresh task.
    const sid = (mode === 'query' && activeSessionId)
      ? activeSessionId
      : store.createTask(mode, effectiveRole, requirement.trim());
    store.setActiveSession(mode, sid);
    resetTaskTracking(sid);

    const msg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      type: 'user' as const,
      content: requirement.trim(),
      timestamp: getCurrentTime(),
    };
    store.appendMessage(sid, msg);

    // Build history for query mode
    let history: Array<{ role: 'user' | 'assistant'; content: string }> | undefined;
    if (mode === 'query') {
      const existingTask = task;
      if (existingTask) {
        history = existingTask.messages
          .filter((m) => m.type === 'user' || m.type === 'ai')
          .slice(-10)
          .map((m) => ({
            role: m.type === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.content,
          }));
      }
    }

    const reqText = requirement.trim();
    setRequirement('');

    if (useStream) {
      const stream = executeDesignStream(
        { requirement: reqText, mode, role: effectiveRole, sessionId: sid, history },
        (event, data) => onStreamEvent(sid, event, data),
        (err) => {
          if (!mountedRef.current) return;
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
        }
      );
      store.setStreamRef(sid, stream);
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
    store.setActiveSession(mode, null);
    setRequirement('');
  };

  const handleSelectSession = (session: SessionMeta) => {
    // For simplicity, just show the session output as a read-only view
    // In a full implementation we'd load the full task state
    if (session.mode) {
      router.push(`/${session.mode}`);
      const sid = store.createTask(session.mode as TaskMode, session.role || 'chief_designer', session.requirement || '');
      store.setActiveSession(session.mode as TaskMode, sid);
      if (session.requirement) {
        store.appendMessage(sid, {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'user',
          content: session.requirement,
          timestamp: getCurrentTime(),
        });
      }
      if (session.output) {
        store.appendMessage(sid, {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'ai',
          content: session.output,
          timestamp: getCurrentTime(),
        });
      }
      if (session.error) {
        store.appendMessage(sid, {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
          type: 'system',
          content: `历史错误: ${session.error}`,
          timestamp: getCurrentTime(),
        });
      }
    }
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
  const sessionId = task?.sessionId || null;
  const status = task?.status || 'idle';
  const statusText = task?.statusText || '就绪';
  const executionTime = task?.executionTime || '0:00';
  const messageCount = messages.length;

  return (
    <div className="h-screen w-screen flex flex-col bg-paper overflow-hidden">
      <Header
        mode={mode}
        onModeChange={(newMode) => router.push(`/${newMode}`)}
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
                  <ChatBubble key={msg.id} msg={msg} sessionId={sessionId} role={effectiveRole} />
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
    </div>
  );
}

const ChatBubble = React.memo(function ChatBubble({
  msg,
  sessionId,
  role,
}: {
  msg: ChatMessage;
  sessionId: string | null;
  role: string;
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
      <p className="text-sm text-ink/60 mb-6 max-w-sm">
        {mode === 'query'
          ? '输入您想查询的知识内容，AI 将为您检索游戏策划相关知识。'
          : mode === 'table'
          ? '输入配表需求，AI 将为您生成游戏配置表格。'
          : '输入您的游戏设计需求，AI 将为您生成完整的策划方案。'}
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
