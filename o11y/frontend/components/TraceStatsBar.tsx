"use client";

import { Wrench, AlertTriangle, Layers } from "lucide-react";
import { TraceStats } from "@/lib/api";

interface Props {
  stats: TraceStats;
}

export default function TraceStatsBar({ stats }: Props) {
  return (
    <div className="flex items-center gap-4 px-4 py-1.5 border-b border-app-border/60 bg-app-raised text-[11px] shrink-0">
      {/* LLM calls */}
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-violet-400/60" />
        <span className="text-app-dim">LLM</span>
        <span className="text-app-text font-mono">{stats.llm_call_count}</span>
      </div>

      <div className="w-px h-3 bg-app-border" />

      {/* Tool calls */}
      <div className="flex items-center gap-1.5">
        <Wrench size={10} className="text-amber-400" />
        <span className="text-app-dim">工具</span>
        <span className="text-app-text font-mono">{stats.tool_call_count}</span>
      </div>

      <div className="w-px h-3 bg-app-border" />

      {/* Span count */}
      <div className="flex items-center gap-1.5">
        <Layers size={10} className="text-app-faint" />
        <span className="text-app-dim">步骤</span>
        <span className="text-app-text font-mono">{stats.span_count}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Error badge */}
      {stats.error_count > 0 && (
        <div className="flex items-center gap-1.5 text-red-400">
          <AlertTriangle size={11} />
          <span className="font-mono">{stats.error_count} 错误</span>
        </div>
      )}
    </div>
  );
}
