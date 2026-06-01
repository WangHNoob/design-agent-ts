'use client';

import { useState, useEffect } from 'react';
import { Terminal, Activity, Loader2 } from 'lucide-react';
import { listO11ySessions, getO11ySession, type O11ySession, type O11ySpan } from '@/lib/api';

export default function LogStream() {
  const [spans, setSpans] = useState<O11ySpan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const sessions = await listO11ySessions(0, 1);
      if (sessions.length > 0) {
        const session = await getO11ySession(sessions[0].id);
        if (session) {
          const allSpans = session.traces.flatMap((t) => t.spans);
          allSpans.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
          setSpans(allSpans.slice(0, 20));
        } else {
          setSpans([]);
        }
      } else {
        setSpans([]);
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-ink/40" />
          <h3 className="text-sm font-medium text-ink/50">系统日志</h3>
        </div>
        {loading && spans.length === 0 && <Loader2 size={14} className="animate-spin text-ink/30" />}
      </div>

      <div className="rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed overflow-x-auto max-h-80 overflow-y-auto">
        {loading && spans.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-ink/40">
            <Loader2 size={16} className="animate-spin mr-2" />
            加载观测数据...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-ink/50">{error}</p>
            <p className="text-ink/30 mt-1 text-[11px]">请确保 O11y 服务已启动（端口 3003）</p>
          </div>
        ) : spans.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity size={20} className="text-ink/30 mb-2" />
            <p className="text-ink/50">暂无观测数据</p>
            <p className="text-ink/30 mt-1 text-[11px]">执行一次任务后将自动采集链路日志</p>
          </div>
        ) : (
          <div className="space-y-2">
            {spans.map((span) => (
              <div key={span.id} className="flex items-start gap-3 text-ink/70">
                <span className="shrink-0 text-ink/30">
                  {new Date(span.start_time).toLocaleTimeString('zh-CN')}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                    span.span_type === 'LLM'
                      ? 'bg-coral/20 text-coral'
                      : span.span_type === 'TOOL'
                      ? 'bg-amber-100/20 text-amber-400'
                      : span.span_type === 'DIRECTOR'
                      ? 'bg-indigo/20 text-indigo-300'
                      : 'bg-ink/20 text-ink/50'
                  }`}
                >
                  {span.span_type}
                </span>
                <span className="break-all">
                  {span.name}
                  {span.duration_ms !== undefined && (
                    <span className="text-ink/40 ml-1">({span.duration_ms}ms)</span>
                  )}
                  {span.status === 'error' && (
                    <span className="text-red-400 ml-1">[ERROR]</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
