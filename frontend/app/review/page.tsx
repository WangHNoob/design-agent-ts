'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardCheck, CheckCircle2, XCircle, Edit3, Clock, AlertCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';
import DeerflowBadge from '@/components/DeerflowBadge';
import { listHITLCheckpoints, reviewHITLCheckpoint, type HITLCheckpoint } from '@/lib/api';

export default function ReviewPage() {
  const [checkpoints, setCheckpoints] = useState<HITLCheckpoint[]>([]);
  const [selected, setSelected] = useState<HITLCheckpoint | null>(null);
  const [loading, setLoading] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    loadCheckpoints();
    const interval = setInterval(loadCheckpoints, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadCheckpoints = async () => {
    try {
      const res = await listHITLCheckpoints();
      setCheckpoints(res.checkpoints);
    } catch {
      // ignore
    }
  };

  const handleReview = async (action: 'approve' | 'reject' | 'modify') => {
    if (!selected) return;
    setLoading(true);
    try {
      await reviewHITLCheckpoint(selected.id, action, {
        comment: comment || undefined,
        modifiedContent: action === 'modify' ? editContent : undefined,
      });
      setSelected(null);
      setComment('');
      setEditContent('');
      loadCheckpoints();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const openReview = (cp: HITLCheckpoint) => {
    setSelected(cp);
    setEditContent(cp.content);
    setComment('');
  };

  const stageLabels: Record<string, string> = {
    plan: '任务计划',
    subagent: '子 Agent 产出',
    integrate: '最终整合',
  };

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-coral text-white">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-ink">HITL 审阅中心</h1>
              <p className="text-sm text-ink/40">人工介入审阅 — 确认、修改或驳回 Agent 产出</p>
            </div>
          </div>
        </motion.div>

        {checkpoints.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-ink/8 bg-white p-12 text-center shadow-warm"
          >
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink/5">
                <CheckCircle2 size={32} className="text-success" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-ink">暂无待审阅项</h3>
            <p className="mt-1 text-sm text-ink/40">所有检查点已处理完毕，系统运行正常</p>
          </motion.div>
        ) : (
          <div className="grid gap-4">
            {checkpoints.map((cp, index) => (
              <motion.div
                key={cp.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="rounded-2xl border border-ink/8 bg-white p-5 shadow-warm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-[11px] font-medium text-warning">
                        <Clock size={10} />
                        等待审阅
                      </span>
                      <span className="text-xs text-ink/30">{stageLabels[cp.stage] ?? cp.stage}</span>
                      {cp.agentName && (
                        <span className="text-xs text-indigo">{cp.agentName}</span>
                      )}
                    </div>
                    <div className="text-sm text-ink/60 line-clamp-3">
                      {cp.content.slice(0, 200)}
                      {cp.content.length > 200 ? '...' : ''}
                    </div>
                    <p className="mt-2 text-[11px] text-ink/25">
                      Session: {cp.sessionId} · {new Date(cp.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => openReview(cp)}
                    className="ml-4 shrink-0 rounded-xl bg-coral px-4 py-2 text-sm font-medium text-white hover:bg-coral/90 transition-colors"
                  >
                    审阅
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-warm-lg"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-ink/5">
                <div className="flex items-center gap-2">
                  <AlertCircle size={18} className="text-coral" />
                  <h3 className="font-semibold text-ink">审阅: {stageLabels[selected.stage]}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-ink/30 hover:text-ink transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[50vh]">
                <label className="text-xs font-medium text-ink/40 mb-1.5 block">内容</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full resize-none rounded-xl border-2 border-ink/8 bg-paper/50 p-4 text-sm leading-relaxed text-ink focus:border-coral/50 focus:outline-none transition-all"
                  rows={10}
                />

                <label className="text-xs font-medium text-ink/40 mb-1.5 mt-4 block">审阅意见（可选）</label>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="输入审阅意见..."
                  className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink/5 bg-paper/30">
                <button
                  onClick={() => handleReview('reject')}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl border border-coral/20 px-4 py-2.5 text-sm font-medium text-coral hover:bg-coral/5 transition-colors disabled:opacity-40"
                >
                  <XCircle size={15} />
                  驳回
                </button>
                <button
                  onClick={() => handleReview('modify')}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl border border-indigo/20 px-4 py-2.5 text-sm font-medium text-indigo hover:bg-indigo/5 transition-colors disabled:opacity-40"
                >
                  <Edit3 size={15} />
                  修改并确认
                </button>
                <button
                  onClick={() => handleReview('approve')}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white hover:bg-coral/90 transition-colors disabled:opacity-40"
                >
                  <CheckCircle2 size={15} />
                  {loading ? '提交中...' : '确认通过'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <DeerflowBadge />
    </div>
  );
}
