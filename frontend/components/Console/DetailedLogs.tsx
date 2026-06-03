'use client';

import { useState } from 'react';
import { Terminal, ChevronDown, ChevronRight } from 'lucide-react';

export interface DetailedLog {
  id: string;
  time: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

interface Props {
  logs: DetailedLog[];
  onClear: () => void;
}

export default function DetailedLogs({ logs, onClear }: Props) {
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(['info', 'warn', 'error']));
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Terminal size={20} className="text-ink/20 mb-2" />
        <p className="text-[12px] text-ink/40">暂无日志</p>
      </div>
    );
  }

  // Extract unique sources
  const sources = Array.from(new Set(logs.map((log) => log.source)));

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (!levelFilter.has(log.level)) return false;
    if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
    return true;
  });

  const toggleLevel = (level: string) => {
    const newFilter = new Set(levelFilter);
    if (newFilter.has(level)) {
      newFilter.delete(level);
    } else {
      newFilter.add(level);
    }
    setLevelFilter(newFilter);
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedLogs(newExpanded);
  };

  return (
    <div className="space-y-2">
      {/* Filters */}
      <div className="flex items-center gap-2 pb-2 border-b border-ink/6">
        {/* Level filter */}
        <div className="flex items-center gap-1">
          {['debug', 'info', 'warn', 'error'].map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                levelFilter.has(level)
                  ? getLevelStyle(level as DetailedLog['level']).active
                  : 'bg-ink/5 text-ink/30'
              }`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="text-[10px] px-2 py-0.5 rounded bg-white border border-ink/10 text-ink/70"
        >
          <option value="all">全部来源</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Clear button */}
        <button
          onClick={onClear}
          className="text-[10px] text-ink/30 hover:text-coral transition-colors"
        >
          清空
        </button>
      </div>

      {/* Log count */}
      <div className="text-[10px] text-ink/30 px-1">
        {filteredLogs.length} / {logs.length} 条日志
      </div>

      {/* Logs list */}
      <div className="space-y-1">
        {filteredLogs.map((log) => {
          const hasData = log.data && Object.keys(log.data).length > 0;
          const isExpanded = expandedLogs.has(log.id);
          const levelStyle = getLevelStyle(log.level);

          return (
            <div
              key={log.id}
              className="rounded-md border border-transparent hover:border-ink/6 hover:bg-paper/30 transition-colors"
            >
              <div className="flex items-start gap-1.5 px-1.5 py-1">
                {/* Time */}
                <span className="shrink-0 text-[9px] text-ink/25 font-mono mt-0.5 w-12">
                  {log.time}
                </span>

                {/* Level badge */}
                <span
                  className={`shrink-0 text-[9px] font-bold px-1 rounded mt-0.5 ${levelStyle.badge}`}
                >
                  {log.level.toUpperCase()}
                </span>

                {/* Source */}
                <span className="shrink-0 text-[9px] text-ink/40 font-mono mt-0.5">
                  [{log.source}]
                </span>

                {/* Message */}
                <span className="text-[11px] text-ink/70 break-all flex-1">
                  {log.message}
                </span>

                {/* Duration */}
                {log.durationMs !== undefined && (
                  <span className="shrink-0 text-[9px] text-ink/25 font-mono mt-0.5">
                    {formatDuration(log.durationMs)}
                  </span>
                )}

                {/* Expand button */}
                {hasData && (
                  <button
                    onClick={() => toggleExpanded(log.id)}
                    className="shrink-0 text-ink/30 hover:text-ink/60 transition-colors mt-0.5"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                )}
              </div>

              {/* Expanded data */}
              {hasData && isExpanded && (
                <pre className="mx-1.5 mb-1 px-2 py-1 bg-ink/5 rounded text-[10px] text-ink/50 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getLevelStyle(level: DetailedLog['level']) {
  return {
    debug: {
      badge: 'text-slate-600 bg-slate-50',
      active: 'bg-slate-100 text-slate-700',
    },
    info: {
      badge: 'text-blue-600 bg-blue-50',
      active: 'bg-blue-100 text-blue-700',
    },
    warn: {
      badge: 'text-amber-600 bg-amber-50',
      active: 'bg-amber-100 text-amber-700',
    },
    error: {
      badge: 'text-red-600 bg-red-50',
      active: 'bg-red-100 text-red-700',
    },
  }[level];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
