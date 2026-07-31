'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Edit3, Loader2, XCircle } from 'lucide-react';
import {
  getHITLCheckpoint,
  reviewHITLCheckpoint,
  type HITLCheckpoint,
} from '@/lib/api';

const STAGE_LABELS: Record<string, string> = {
  plan: '任务计划',
  subagent: '子 Agent 产出',
  integrate: '最终整合',
};

interface Props {
  open: boolean;
  checkpointId: string | null;
  /** Optional plan payload already present on the SSE hitl event. */
  fallbackContent?: string;
  onClose: () => void;
  onReviewed: (result: {
    action: 'approve' | 'reject' | 'modify';
    checkpoint: HITLCheckpoint;
    executionId?: string;
  }) => void;
}

export default function HitlReviewModal({
  open,
  checkpointId,
  fallbackContent,
  onClose,
  onReviewed,
}: Props) {
  const [checkpoint, setCheckpoint] = useState<HITLCheckpoint | null>(null);
  const [editContent, setEditContent] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !checkpointId) return;
    let cancelled = false;
    setFetching(true);
    setError('');
    getHITLCheckpoint(checkpointId)
      .then((cp) => {
        if (cancelled) return;
        setCheckpoint(cp);
        setEditContent(cp.content || fallbackContent || '');
        setComment('');
      })
      .catch((err) => {
        if (cancelled) return;
        setCheckpoint(null);
        setEditContent(fallbackContent || '');
        setError(err instanceof Error ? err.message : '加载审阅内容失败');
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, checkpointId, fallbackContent]);

  const handleReview = async (action: 'approve' | 'reject' | 'modify') => {
    if (!checkpointId) return;
    setLoading(true);
    setError('');
    try {
      const updated = await reviewHITLCheckpoint(checkpointId, action, {
        comment: comment || undefined,
        modifiedContent: action === 'modify' ? editContent : undefined,
      });
      onReviewed({
        action,
        checkpoint: updated,
        executionId: updated.executionId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交审阅失败');
    } finally {
      setLoading(false);
    }
  };

  const stageLabel = STAGE_LABELS[checkpoint?.stage ?? 'plan'] ?? checkpoint?.stage ?? '人工审阅';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/25 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-ink/8 bg-white shadow-warm-lg"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink/5">
              <div className="flex items-center gap-2">
                <AlertCircle size={18} className="text-coral" />
                <div>
                  <h3 className="font-semibold text-ink">需要人工审阅 · {stageLabel}</h3>
                  {checkpoint?.reviewPoint && (
                    <p className="text-[11px] text-ink/35">{checkpoint.reviewPoint}</p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-ink/30 hover:text-ink transition-colors"
                aria-label="关闭"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[50vh]">
              {fetching ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink/50">
                  <Loader2 size={16} className="animate-spin" />
                  加载审阅内容…
                </div>
              ) : (
                <>
                  <label className="text-xs font-medium text-ink/40 mb-1.5 block">内容</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full resize-none rounded-xl border-2 border-ink/8 bg-paper/50 p-4 text-sm leading-relaxed text-ink focus:border-coral/50 focus:outline-none transition-all font-mono"
                    rows={12}
                  />

                  <label className="text-xs font-medium text-ink/40 mb-1.5 mt-4 block">
                    审阅意见（可选）
                  </label>
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="输入审阅意见..."
                    className="w-full rounded-xl border-2 border-ink/8 bg-paper/50 px-4 py-2.5 text-sm text-ink placeholder:text-ink/25 focus:border-coral/50 focus:outline-none transition-all"
                  />
                </>
              )}

              {error && (
                <p className="mt-3 text-sm text-coral">{error}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-ink/5 bg-paper/30">
              <button
                onClick={() => handleReview('reject')}
                disabled={loading || fetching || !checkpointId}
                className="flex items-center gap-1.5 rounded-xl border border-coral/20 px-4 py-2.5 text-sm font-medium text-coral hover:bg-coral/5 transition-colors disabled:opacity-40"
              >
                <XCircle size={15} />
                驳回
              </button>
              <button
                onClick={() => handleReview('modify')}
                disabled={loading || fetching || !checkpointId}
                className="flex items-center gap-1.5 rounded-xl border border-indigo/20 px-4 py-2.5 text-sm font-medium text-indigo hover:bg-indigo/5 transition-colors disabled:opacity-40"
              >
                <Edit3 size={15} />
                修改并确认
              </button>
              <button
                onClick={() => handleReview('approve')}
                disabled={loading || fetching || !checkpointId}
                className="flex items-center gap-1.5 rounded-xl bg-coral px-5 py-2.5 text-sm font-medium text-white hover:bg-coral/90 transition-colors disabled:opacity-40"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                {loading ? '提交中...' : '确认通过'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
