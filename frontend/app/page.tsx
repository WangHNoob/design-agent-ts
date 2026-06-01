'use client';

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Loader2, Zap, User, Bot, Info } from 'lucide-react';
import Header from '@/components/Console/Header';
import SessionSidebar from '@/components/Console/SessionSidebar';
import RightPanel, { type ExecStep, type DebugLog } from '@/components/Console/RightPanel';
import AgentStatusCards, { type AgentStatus, useAgentStatuses } from '@/components/Console/AgentStatusCards';
import ModeSelector from '@/components/Console/ModeSelector';
import RoleSelector from '@/components/Console/RoleSelector';
import ResultPanel from '@/components/Console/ResultPanel';
import { executeDesignStream, listSessions, type SessionMeta } from '@/lib/api';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: string;
}

function getCurrentTime() {
  return new Date().toTimeString().split(' ')[0];
}

function generateSessionId() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `gdt-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export default function ConsolePage() {
  const mountedRef = useRef(true);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const execTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      streamRef.current?.close();
      if (execTimerRef.current) clearInterval(execTimerRef.current);
    };
  }, []);

  // ── Core state ──
  const [mode, setMode] = useState<'design' | 'query' | 'table'>('design');
  const [role, setRole] = useState('chief_designer');
  const [requirement, setRequirement] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);

  // Session & messages
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCount, setMessageCount] = useState(0);

  // Execution monitoring
  const [steps, setSteps] = useState<ExecStep[]>([]);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [rawAgentStatuses, setRawAgentStatuses] = useState<Partial<AgentStatus>[]>([]);
  const [executionTime, setExecutionTime] = useState('0:00');
  const [status, setStatus] = useState<'idle' | 'working' | 'waiting' | 'error'>('idle');
  const [statusText, setStatusText] = useState('就绪');

  // UI state
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [useStream, setUseStream] = useState(true);

  const agents = useAgentStatuses(rawAgentStatuses);

  // ── Helpers ──
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = (type: ChatMessage['type'], content: string) => {
    const msg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      type,
      content,
      timestamp: getCurrentTime(),
    };
    setMessages((prev) => [...prev, msg]);
    setMessageCount((c) => c + 1);
    setTimeout(scrollToBottom, 50);
  };

  const addStep = (message: string) => {
    setSteps((prev) => [...prev, { time: getCurrentTime(), message }]);
  };

  const addLog = (category: DebugLog['category'], message: string, data?: string) => {
    setLogs((prev) => [...prev, { time: getCurrentTime(), category, message, data }]);
  };

  const startExecutionTimer = () => {
    const start = Date.now();
    if (execTimerRef.current) clearInterval(execTimerRef.current);
    execTimerRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(s / 60);
      setExecutionTime(`${m}:${(s % 60).toString().padStart(2, '0')}`);
    }, 1000);
  };

  const stopExecutionTimer = () => {
    if (execTimerRef.current) {
      clearInterval(execTimerRef.current);
      execTimerRef.current = null;
    }
  };

  const resetExecution = () => {
    setSteps([]);
    setLogs([]);
    setRawAgentStatuses([]);
    setExecutionTime('0:00');
    stopExecutionTimer();
  };

  // ── Stream handling ──
  const handleStreamEvent = useCallback((event: string, data: unknown) => {
    if (!mountedRef.current) return;
    const d = data as Record<string, unknown>;

    switch (event) {
      case 'start':
        setStreaming(true);
        setStatus('working');
        setStatusText('处理中');
        addStep('→ 请求已接收，AI 正在分析需求…');
        addLog('info', '执行开始', JSON.stringify({ sessionId: d.sessionId, mode, role }));
        startExecutionTimer();
        break;

      case 'plan':
        setStatusText('任务规划中');
        addStep(`规划: ${d.message as string}`);
        setRawAgentStatuses([{ id: 'director', status: 'running', progress: 30 }]);
        break;

      case 'route':
        setStatusText('路由分配中');
        addStep(`路由: ${d.message as string}`);
        setRawAgentStatuses((prev) => [
          ...prev.filter((a) => a.id !== 'director'),
          { id: 'director', status: 'completed', progress: 100 },
        ]);
        break;

      case 'task_start':
        setStatusText(`执行: ${d.description as string}`);
        addStep(`开始任务: ${d.description as string}`);
        // Map domain to agent
        const domain = (d.domain as string) || '';
        const agentMap: Record<string, string> = {
          system: 'system',
          combat: 'combat',
          numerical: 'numerical',
          gameplay: 'gameplay',
          executive: 'executive',
          qa: 'qa',
        };
        const agentId = agentMap[domain.toLowerCase()] || '';
        if (agentId) {
          setRawAgentStatuses((prev) => [
            ...prev.filter((a) => a.id !== agentId),
            { id: agentId, status: 'running', progress: 20 },
          ]);
        }
        break;

      case 'task_complete':
        addStep(`任务完成: ${d.taskId as string}`);
        break;

      case 'integrate':
        setStatusText('整合结果中');
        addStep('整合: 正在合并子任务结果…');
        break;

      case 'chunk':
        // Query mode streaming text
        break;

      case 'complete': {
        setStreaming(false);
        setLoading(false);
        setStatus('idle');
        setStatusText('就绪');
        const output = (d.output as string) || '';
        if (output) addMessage('ai', output);
        addStep('✓ 执行完成');
        addLog('info', '执行完成', JSON.stringify({ outputLength: output.length }));
        setRawAgentStatuses((prev) =>
          prev.map((a) => ({ ...a, status: 'completed' as const, progress: 100 }))
        );
        stopExecutionTimer();
        setRefreshTick((t) => t + 1);
        break;
      }

      case 'error': {
        setStreaming(false);
        setLoading(false);
        setStatus('error');
        setStatusText('错误');
        const errMsg = (d.error as string) || '未知错误';
        addMessage('system', `执行出错: ${errMsg}`);
        addStep(`✗ 错误: ${errMsg}`);
        addLog('error', '执行失败', errMsg);
        setRawAgentStatuses((prev) =>
          prev.map((a) => ({ ...a, status: a.status === 'running' ? 'error' : a.status, progress: a.progress }))
        );
        stopExecutionTimer();
        break;
      }
    }
  }, [mode, role]);

  // ── Submit ──
  const handleSubmit = async () => {
    if (!requirement.trim() || loading) return;

    const sid = sessionId ?? generateSessionId();
    setSessionId(sid);
    setLoading(true);
    resetExecution();

    addMessage('user', requirement.trim());
    setRequirement('');

    if (useStream) {
      streamRef.current = executeDesignStream(
        { requirement: requirement.trim(), mode, role, sessionId: sid },
        handleStreamEvent,
        (err) => {
          if (!mountedRef.current) return;
          setLoading(false);
          setStreaming(false);
          setStatus('error');
          setStatusText('错误');
          addMessage('system', `网络错误: ${err.message}`);
          addLog('error', '请求异常', err.message);
          stopExecutionTimer();
        }
      );
    } else {
      try {
        const { executeDesign } = await import('@/lib/api');
        const res = await executeDesign({ requirement: requirement.trim(), mode, role, sessionId: sid });
        if (mountedRef.current) {
          if (res.success && res.output) {
            addMessage('ai', res.output);
            addStep('✓ 执行完成');
            setStatus('idle');
            setStatusText('就绪');
          } else if (res.error) {
            addMessage('system', `执行出错: ${res.error}`);
            setStatus('error');
            setStatusText('错误');
          }
          setLoading(false);
          setRefreshTick((t) => t + 1);
        }
      } catch (err) {
        if (mountedRef.current) {
          const msg = err instanceof Error ? err.message : '网络请求失败';
          addMessage('system', `网络错误: ${msg}`);
          setLoading(false);
          setStatus('error');
          setStatusText('错误');
        }
      }
    }
  };

  // ── Session selection ──
  const handleSelectSession = (session: SessionMeta) => {
    setSessionId(session.id);
    setRequirement(session.requirement || '');
    if (session.mode) setMode(session.mode);
    if (session.role) setRole(session.role);
    setMessages([]);
    if (session.requirement) {
      addMessage('user', session.requirement);
    }
    if (session.output) {
      addMessage('ai', session.output);
    }
    if (session.error) {
      addMessage('system', `历史错误: ${session.error}`);
    }
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setRequirement('');
    setMessageCount(0);
    resetExecution();
    setStatus('idle');
    setStatusText('就绪');
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

  return (
    <div className="h-screen w-screen flex flex-col bg-paper overflow-hidden">
      <Header
        mode={mode}
        onModeChange={setMode}
        role={role}
        onRoleChange={setRole}
        status={status}
        statusText={statusText}
        onNewChat={handleNewChat}
        onToggleRightPanel={() => setRightPanelOpen((v) => !v)}
        rightPanelOpen={rightPanelOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Session Sidebar */}
        <SessionSidebar
          selectedId={sessionId}
          onSelect={handleSelectSession}
          onNew={handleNewChat}
          refreshTick={refreshTick}
        />

        {/* Center: Chat Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-paper">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {messages.length === 0 ? (
              <WelcomeScreen mode={mode} role={role} onExampleClick={(text) => setRequirement(text)} />
            ) : (
              <div className="space-y-4 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} msg={msg} />
                ))}
                {streaming && (
                  <div className="flex items-center gap-2 text-xs text-ink/40">
                    <div className="w-1.5 h-1.5 rounded-full bg-coral animate-pulse" />
                    AI 正在思考…
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-ink/6 px-6 py-3">
            <div className="max-w-3xl mx-auto">
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
                  className="w-full resize-none bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink/25 focus:outline-none disabled:opacity-50"
                />
                <div className="flex items-center justify-between px-3 pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUseStream(!useStream)}
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                        useStream ? 'bg-coral/10 text-coral' : 'bg-ink/5 text-ink/30'
                      }`}
                    >
                      <Zap size={10} />
                      {useStream ? '流式' : '非流式'}
                    </button>
                    <span className="text-[10px] text-ink/25 hidden sm:inline">Enter 发送，Shift+Enter 换行</span>
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !requirement.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {loading ? '处理中' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Monitor Panel */}
        {rightPanelOpen && (
          <RightPanel
            steps={steps}
            logs={logs}
            agents={agents}
            sessionId={sessionId}
            messageCount={messageCount}
            executionTime={executionTime}
            onClearLogs={() => setLogs([])}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

const ChatBubble = React.memo(function ChatBubble({ msg }: { msg: ChatMessage }) {
  if (msg.type === 'system') {
    return (
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink/5 text-[11px] text-ink/40">
          <Info size={12} />
          {msg.content}
          <span className="text-ink/20">{msg.timestamp}</span>
        </div>
      </div>
    );
  }

  const isUser = msg.type === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
    >
      <div className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg ${
        isUser ? 'bg-ink/8 text-ink/50' : 'bg-coral text-white'
      }`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser ? 'bg-coral text-white' : 'bg-white border border-ink/6 text-ink'
      }`}>
        <div className="whitespace-pre-wrap">{msg.content}</div>
        <div className={`text-[10px] mt-1 ${isUser ? 'text-white/60' : 'text-ink/30'}`}>
          {msg.timestamp}
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
      <p className="text-sm text-ink/40 mb-6 max-w-sm">
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
