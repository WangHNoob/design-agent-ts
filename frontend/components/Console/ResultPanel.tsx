'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { useState } from 'react';
// reportUserSignal 已上移到 lib/userSignals：本组件目前无人引用，
// 不应让使用方为工具函数把 react-markdown 拖进 bundle（bundle-barrel 同理）
import { reportUserSignal } from '@/lib/userSignals';

interface Props {
  output: string | null;
  error: string | null;
  loading: boolean;
  /** 用户信号（flywheel 03-P4）：复制/评分时上报，供观测台在线评测采样 */
  sessionId?: string | null;
  executionId?: string | null;
  traceId?: string | null;
}

export default function ResultPanel({ output, error, loading, sessionId, executionId, traceId }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (output) {
      navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // 用户明确复制了结果 → 强采样信号（观测台候选池第 4 源）
      reportUserSignal({ kind: 'copied', sessionId, executionId, traceId });
    }
  };

  if (!output && !error && !loading) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-ink/8 bg-white shadow-warm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink/5 px-5 py-3">
        <div className="flex items-center gap-2">
          {error ? (
            <AlertCircle size={16} className="text-coral" />
          ) : (
            <CheckCircle2 size={16} className="text-success" />
          )}
          <span className="text-sm font-medium text-ink/70">
            {error ? '执行出错' : '策划结果'}
          </span>
        </div>
        {output && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink/40 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            {copied ? '已复制' : '复制'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        {error ? (
          <div className="rounded-xl bg-coral/5 border border-coral/10 p-4">
            <p className="text-sm text-coral leading-relaxed">{error}</p>
          </div>
        ) : output ? (
          <div className="markdown-content text-sm text-ink/80">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {output}
            </ReactMarkdown>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
