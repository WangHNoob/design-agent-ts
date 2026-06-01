"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Filter } from "lucide-react";
import { apiClient, Log } from "@/lib/api";
import { cn, formatTime, truncate } from "@/lib/utils";

interface Props {
  spanId: string;
}

const LEVEL_META: Record<string, { label: string; color: string; bg: string }> = {
  DEBUG: { label: "DEBUG", color: "text-slate-400", bg: "bg-slate-500/10" },
  INFO:  { label: "INFO",  color: "text-blue-700",  bg: "bg-blue-100" },
  WARN:  { label: "WARN",  color: "text-amber-400", bg: "bg-amber-500/10" },
  ERROR: { label: "ERROR", color: "text-red-700",   bg: "bg-red-100" },
};

export default function LogPanel({ spanId }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpandedId(null);
    apiClient
      .getLogsBySpan(spanId)
      .then(setLogs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [spanId]);

  const filtered = useMemo(() => {
    if (!filterLevel) return logs;
    return logs.filter((l) => l.level === filterLevel);
  }, [logs, filterLevel]);

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of logs) {
      counts[l.level] = (counts[l.level] || 0) + 1;
    }
    return counts;
  }, [logs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-[12px] text-app-dim animate-pulse">
        加载日志…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8 text-[12px] text-red-400">
        <AlertTriangle size={12} className="mr-1" />
        加载失败: {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={11} className="text-app-faint shrink-0" />
        <button
          onClick={() => setFilterLevel(null)}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded transition-colors",
            filterLevel === null
              ? "bg-sky-100 text-sky-700"
              : "text-app-dim hover:text-app-text hover:bg-app-raised"
          )}
        >
          全部 ({logs.length})
        </button>
        {Object.entries(levelCounts).map(([level, count]) => {
          const meta = LEVEL_META[level] ?? LEVEL_META.INFO;
          return (
            <button
              key={level}
              onClick={() => setFilterLevel(filterLevel === level ? null : level)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-colors",
                filterLevel === level
                  ? cn(meta.bg, meta.color)
                  : "text-app-dim hover:text-app-text hover:bg-app-raised"
              )}
            >
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Log list */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-app-dim">暂无日志</div>
      ) : (
        <div className="space-y-1">
          {filtered.map((log) => {
            const meta = LEVEL_META[log.level] ?? LEVEL_META.INFO;
            const isExpanded = expandedId === log.id;
            const hasException = !!log.exception;

            return (
              <div
                key={log.id}
                className={cn(
                  "rounded-md border transition-colors",
                  isExpanded ? "border-app-border bg-app-raised" : "border-transparent hover:bg-app-raised/60"
                )}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  className="w-full text-left flex items-start gap-2 px-2.5 py-1.5"
                >
                  <span className="shrink-0 mt-0.5">
                    {isExpanded ? (
                      <ChevronDown size={10} className="text-app-faint" />
                    ) : (
                      <ChevronRight size={10} className="text-app-faint" />
                    )}
                  </span>

                  <span
                    className={cn(
                      "shrink-0 text-[9px] font-bold px-1 py-0 rounded mt-0.5",
                      meta.bg,
                      meta.color
                    )}
                  >
                    {meta.label}
                  </span>

                  <span className="shrink-0 text-[10px] text-app-faint font-mono mt-0.5">
                    {formatTime(log.timestamp).split(" ")[1]}
                  </span>

                  <span className="shrink-0 text-[10px] text-app-faint truncate max-w-[120px] mt-0.5">
                    {log.logger}
                  </span>

                  <span className={cn("text-[11px] flex-1 break-all", log.level === "ERROR" ? "text-red-700" : "text-app-text")}>
                    {isExpanded ? log.message : truncate(log.message, 120)}
                  </span>

                  {hasException && (
                    <span className="shrink-0 text-[9px] text-red-700 bg-red-100 px-1 rounded mt-0.5">
                      异常
                    </span>
                  )}
                </button>

                {isExpanded && (
                  <div className="px-2.5 pb-2.5 pt-0 space-y-2">
                    {/* Full message */}
                    <pre className="text-[11px] text-app-text bg-app-surface border border-app-border rounded-md p-2 whitespace-pre-wrap break-all">
                      {log.message}
                    </pre>

                    {/* Exception */}
                    {log.exception && (
                      <div className="bg-red-50 border border-red-200 rounded-md p-2">
                        <div className="text-[10px] font-semibold text-red-400 mb-1">异常堆栈</div>
                        <pre className="text-[10px] text-red-600 whitespace-pre-wrap break-all font-mono">
                          {log.exception}
                        </pre>
                      </div>
                    )}

                    {/* Metadata */}
                    {log.metadata && (
                      <div className="json-tree bg-app-surface border border-app-border rounded-md p-2 max-h-48 overflow-y-auto">
                        <pre className="text-[10px] font-mono text-app-text whitespace-pre-wrap">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
