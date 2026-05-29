'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, Loader2, Zap } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import SessionSidebar from '@/components/SessionSidebar';
import ModeSelector from '@/components/Console/ModeSelector';
import RoleSelector from '@/components/Console/RoleSelector';
import AgentFlowAnimation from '@/components/Console/AgentFlowAnimation';
import ResultPanel from '@/components/Console/ResultPanel';
import { executeDesignStream, type SessionMeta } from '@/lib/api';

export default function ConsolePage() {
  const [requirement, setRequirement] = useState('');
  const [mode, setMode] = useState<'design' | 'query' | 'table'>('design');
  const [role, setRole] = useState('chief_designer');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [result, setResult] = useState<{ output: string | null; error: string | null; sessionId: string } | null>(null);
  const [useStream, setUseStream] = useState(true);

  const handleStreamEvent = useCallback((event: string, data: unknown) => {
    const d = data as Record<string, unknown>;
    switch (event) {
      case 'start':
        setStreaming(true);
        setStreamedText('');
        break;
      case 'chunk':
        setStreamedText((prev) => prev + (d.text as string));
        break;
      case 'complete':
        setStreaming(false);
        setLoading(false);
        setResult({
          output: d.output as string,
          error: d.error as string | null,
          sessionId: d.sessionId as string,
        });
        break;
      case 'error':
        setStreaming(false);
        setLoading(false);
        setResult({
          output: null,
          error: d.error as string,
          sessionId: d.sessionId as string,
        });
        break;
    }
  }, []);

  const handleSubmit = async () => {
    if (!requirement.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setStreamedText('');

    if (useStream) {
      executeDesignStream(
        { requirement: requirement.trim(), mode, role },
        handleStreamEvent,
        (err) => {
          setLoading(false);
          setStreaming(false);
          setResult({ output: null, error: err.message, sessionId: '' });
        }
      );
    } else {
      // fallback to non-streaming
      try {
        const { executeDesign } = await import('@/lib/api');
        const res = await executeDesign({ requirement: requirement.trim(), mode, role });
        setResult({ output: res.output, error: res.error, sessionId: res.sessionId });
      } catch (err) {
        setResult({
          output: null,
          error: err instanceof Error ? err.message : '网络请求失败',
          sessionId: '',
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSelectSession = (session: SessionMeta) => {
    if (session.requirement) setRequirement(session.requirement);
    if (session.mode) setMode(session.mode);
    if (session.role) setRole(session.role);
    if (session.output) {
      setResult({ output: session.output, error: session.error ?? null, sessionId: session.id });
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <SessionSidebar currentSessionId={result?.sessionId} onSelectSession={handleSelectSession} />

      <main className="mx-auto max-w-4xl px-6 py-10 pl-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center"
        >
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-coral/8 px-4 py-1.5 text-xs font-medium text-coral">
            <Sparkles size={14} />
            多智能体游戏策划系统
          </div>
          <h1 className="font-display text-3xl font-bold text-ink md:text-4xl">
            今天想设计什么游戏？
          </h1>
          <p className="mt-2 text-sm text-ink/40">
            描述你的设计需求，AI 智能体团队将为你完成完整的策划方案
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-6 rounded-2xl border border-ink/8 bg-white p-6 shadow-warm"
        >
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-ink/60">设计需求</label>
            <button
              onClick={() => setUseStream(!useStream)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                useStream ? 'bg-coral/10 text-coral' : 'bg-ink/5 text-ink/40'
              }`}
            >
              <Zap size={11} />
              {useStream ? '流式输出开启' : '流式输出关闭'}
            </button>
          </div>

          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            placeholder="描述你的游戏设计需求，例如：设计一个RPG游戏的核心战斗系统，包含技能连招、元素反应和团队协作机制..."
            className="w-full resize-none rounded-xl border-2 border-ink/8 bg-paper/50 p-4 text-sm leading-relaxed text-ink placeholder:text-ink/25 focus:border-coral/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-coral/10 transition-all"
            rows={5}
          />

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <ModeSelector value={mode} onChange={setMode} />
            <RoleSelector value={role} onChange={setRole} />
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={loading || !requirement.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-coral py-3.5 text-sm font-semibold text-white shadow-glow-coral transition-all hover:bg-coral/90 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {streaming ? '接收流式输出...' : '策划中...'}
              </>
            ) : (
              <>
                <Send size={18} />
                开始策划
              </>
            )}
          </motion.button>
        </motion.div>

        {loading && !streaming && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <AgentFlowAnimation />
          </motion.div>
        )}

        {streaming && streamedText && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-ink/8 bg-white p-6 shadow-warm"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2 w-2 rounded-full bg-coral animate-pulse" />
              <span className="text-xs font-medium text-ink/50">实时输出中</span>
            </div>
            <div className="markdown-content text-sm text-ink/80 whitespace-pre-wrap">
              {streamedText}
              <span className="inline-block w-0.5 h-4 bg-coral animate-pulse ml-0.5 align-middle" />
            </div>
          </motion.div>
        )}

        {result && !streaming && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <ResultPanel output={result.output} error={result.error} loading={false} />
          </motion.div>
        )}

        {!result && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="grid gap-4 md:grid-cols-3"
          >
            {[
              { title: '战斗系统', desc: '设计技能连招、元素反应、伤害计算公式' },
              { title: '经济系统', desc: '设计货币循环、掉落率、商店定价策略' },
              { title: '关卡设计', desc: '设计地图结构、难度曲线、探索奖励' },
            ].map((tip, i) => (
              <motion.div
                key={tip.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="rounded-xl border border-ink/6 bg-white/60 p-4 backdrop-blur-sm"
              >
                <h3 className="text-sm font-semibold text-ink">{tip.title}</h3>
                <p className="mt-1 text-xs text-ink/40">{tip.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

      <DeerflowBadge />
    </div>
  );
}
