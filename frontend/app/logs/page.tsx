'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Search, Download, Trash2, ChevronDown, ChevronRight, Filter } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { logStore, type StoredSession } from '@/lib/logStore';
import type { DetailedLog } from '@/components/Console/DetailedLogs';

export default function LogsPage() {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set(['info', 'warn', 'error', 'debug']));
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = logStore.listSessions();
    setSessions(stored);
    if (stored.length > 0) {
      setSelectedSessionId(stored[0].sessionId);
    }
  }, []);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  );

  const logs = selectedSession?.logs ?? [];

  const sources = useMemo(() => Array.from(new Set(logs.map((l) => l.source))), [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!levelFilter.has(log.level)) return false;
      if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;
      if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !log.source.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [logs, levelFilter, sourceFilter, searchQuery]);

  const toggleLevel = (level: string) => {
    const newFilter = new Set(levelFilter);
    if (newFilter.has(level)) newFilter.delete(level);
    else newFilter.add(level);
    setLevelFilter(newFilter);
  };

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedLogs(newExpanded);
  };

  const handleExport = () => {
    if (!selectedSessionId) return;
    const data = logStore.exportSession(selectedSessionId);
    if (!data) return;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gdt-session-${selectedSessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    const data = logStore.exportAll();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gdt-all-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    logStore.clearAll();
    setSessions([]);
    setSelectedSessionId(null);
  };

  return (
    <div className="min-h-screen bg-paper">
      <Navbar />
      <div className="mx-auto max-w-7xl px-6 py-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ScrollText size={20} className="text-coral" />
              <h2 className="text-lg font-bold text-ink">执行日志</h2>
              <span className="text-xs text-ink/40">跨会话日志查看器</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink/50 hover:text-ink bg-white border border-ink/10 rounded-lg hover:border-ink/20 transition-colors"
              >
                <Download size={12} />
                全部导出
              </button>
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500/60 hover:text-red-600 bg-white border border-ink/10 rounded-lg hover:border-red-200 transition-colors"
              >
                <Trash2 size={12} />
                清空
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            {/* Session list */}
            <div className="w-64 shrink-0 space-y-2">
              <div className="text-xs font-medium text-ink/50 px-1">会话列表 ({sessions.length})</div>
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {sessions.length === 0 ? (
                  <div className="text-xs text-ink/30 text-center py-8">暂无日志记录</div>
                ) : (
                  sessions.map((s) => (
                    <button
                      key={s.sessionId}
                      onClick={() => setSelectedSessionId(s.sessionId)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        selectedSessionId === s.sessionId
                          ? 'bg-coral/10 text-coral border border-coral/20'
                          : 'bg-white border border-ink/6 text-ink/70 hover:border-ink/15'
                      }`}
                    >
                      <div className="font-mono text-[10px] truncate">{s.sessionId}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-ink/40">{s.logs.length} 条</span>
                        <span className="text-ink/30">{new Date(s.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Log viewer */}
            <div className="flex-1 min-w-0 bg-white rounded-xl border border-ink/8 overflow-hidden">
              {/* Toolbar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-ink/6 bg-paper/50">
                {/* Level filters */}
                <div className="flex items-center gap-1">
                  {(['debug', 'info', 'warn', 'error'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => toggleLevel(level)}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                        levelFilter.has(level) ? getLevelActiveStyle(level) : 'bg-ink/5 text-ink/30'
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
                  className="text-[11px] px-2 py-1 rounded-md bg-white border border-ink/10 text-ink/70"
                >
                  <option value="all">全部来源</option>
                  {sources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {/* Search */}
                <div className="flex-1 relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/30" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索日志..."
                    className="w-full pl-7 pr-3 py-1.5 text-[11px] rounded-md border border-ink/10 bg-white placeholder:text-ink/25 focus:outline-none focus:border-coral/40"
                  />
                </div>

                {/* Export current session */}
                <button
                  onClick={handleExport}
                  disabled={!selectedSessionId}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-ink/40 hover:text-coral rounded-md hover:bg-ink/5 transition-colors disabled:opacity-30"
                >
                  <Download size={11} />
                  导出
                </button>

                {/* Count */}
                <span className="text-[10px] text-ink/30 shrink-0">
                  {filteredLogs.length}/{logs.length}
                </span>
              </div>

              {/* Log entries */}
              <div className="max-h-[65vh] overflow-y-auto divide-y divide-ink/4">
                {filteredLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ScrollText size={24} className="text-ink/15 mb-2" />
                    <p className="text-xs text-ink/30">
                      {logs.length === 0 ? '选择一个会话查看日志' : '无匹配日志'}
                    </p>
                  </div>
                ) : (
                  filteredLogs.map((log) => {
                    const hasData = log.data && Object.keys(log.data).length > 0;
                    const isExpanded = expandedLogs.has(log.id);
                    return (
                      <div key={log.id} className="hover:bg-paper/30 transition-colors">
                        <div className="flex items-start gap-2 px-4 py-2">
                          <span className="shrink-0 text-[10px] text-ink/25 font-mono mt-0.5 w-14">
                            {log.time}
                          </span>
                          <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${getLevelBadgeStyle(log.level)}`}>
                            {log.level.toUpperCase()}
                          </span>
                          <span className="shrink-0 text-[10px] text-ink/40 font-mono mt-0.5">
                            [{log.source}]
                          </span>
                          <span className="text-[11px] text-ink/70 flex-1 break-all">
                            {log.message}
                          </span>
                          {log.durationMs !== undefined && (
                            <span className="shrink-0 text-[9px] text-ink/25 font-mono mt-0.5">
                              {log.durationMs < 1000 ? `${log.durationMs}ms` : `${(log.durationMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                          {hasData && (
                            <button
                              onClick={() => toggleExpanded(log.id)}
                              className="shrink-0 text-ink/30 hover:text-ink/60 transition-colors mt-0.5"
                            >
                              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            </button>
                          )}
                        </div>
                        {hasData && isExpanded && (
                          <pre className="mx-4 mb-2 px-3 py-2 bg-ink/4 rounded-md text-[10px] text-ink/50 whitespace-pre-wrap break-all max-h-48 overflow-y-auto font-mono">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function getLevelActiveStyle(level: string): string {
  const styles: Record<string, string> = {
    debug: 'bg-slate-100 text-slate-700',
    info: 'bg-blue-100 text-blue-700',
    warn: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
  };
  return styles[level] ?? 'bg-ink/10 text-ink/70';
}

function getLevelBadgeStyle(level: string): string {
  const styles: Record<string, string> = {
    debug: 'text-slate-600 bg-slate-50',
    info: 'text-blue-600 bg-blue-50',
    warn: 'text-amber-600 bg-amber-50',
    error: 'text-red-600 bg-red-50',
  };
  return styles[level] ?? 'text-ink/60 bg-ink/5';
}
