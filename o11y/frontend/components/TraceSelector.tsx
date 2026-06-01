"use client";

import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { apiClient, Trace } from "@/lib/api";
import { cn, formatDuration, formatTime, shortId } from "@/lib/utils";
import { STATUS_META } from "@/lib/constants";

interface Props {
  sessionId: string;
  selectedTraceId: string | null;
  onSelect: (traceId: string) => void;
  refreshTick: number;
}

export default function TraceSelector({ sessionId, selectedTraceId, onSelect, refreshTick }: Props) {
  const [traces, setTraces] = useState<Trace[]>([]);

  useEffect(() => {
    apiClient.getTracesBySession(sessionId).then((data) => {
      setTraces(data);
      if (data.length > 0 && !selectedTraceId) {
        onSelect(data[0].id);
      }
    });
  }, [sessionId, refreshTick]);

  if (traces.length === 0) {
    return (
      <div className="px-4 py-2 border-b border-app-border text-[11px] text-app-dim">
        暂无链路数据，等待 Agent 请求…
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-app-border bg-app-raised flex items-center gap-2 overflow-x-auto shrink-0">
      <GitBranch size={12} className="text-app-accent shrink-0" />
      <span className="text-[10px] font-semibold tracking-wider uppercase text-app-dim shrink-0">
        链路
      </span>

      {traces.map((t) => {
        const active = t.id === selectedTraceId;
        const status = STATUS_META[t.status] ?? STATUS_META.ok;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={cn(
              "shrink-0 flex items-center gap-2 px-3 py-1 rounded-full text-[11px] border transition-colors",
              active
                ? "border-sky-400 bg-sky-100 text-app-text"
                : "border-app-border bg-app-surface text-app-dim hover:text-app-text hover:border-app-muted"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
            <span className="truncate max-w-[120px]">
              {t.name || `链路 ${shortId(t.id)}`}
            </span>
            {t.stats && t.stats.error_count > 0 && (
              <span className="text-[10px] text-red-400 font-mono" title={`${t.stats.error_count} 个错误`}>
                {t.stats.error_count} 错
              </span>
            )}
            {t.duration_ms != null && (
              <span className="text-[10px] text-app-faint font-mono">
                {formatDuration(t.duration_ms)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
