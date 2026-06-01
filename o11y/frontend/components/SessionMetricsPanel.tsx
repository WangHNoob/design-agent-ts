"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap, Wrench, AlertTriangle, Clock, Coins, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { apiClient, SessionMetrics } from "@/lib/api";
import { cn, formatDuration, formatTokens } from "@/lib/utils";

interface Props {
  sessionId: string | null;
  refreshTick: number;
}

export default function SessionMetricsPanel({ sessionId, refreshTick }: Props) {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setMetrics(null);
      setError(null);
      return;
    }
    setError(null);
    setLoading(true);
    apiClient
      .getSessionMetrics(sessionId)
      .then(setMetrics)
      .catch((e: Error) => { setMetrics(null); setError(e?.message || "加载指标失败"); })
      .finally(() => setLoading(false));
  }, [sessionId, refreshTick]);

  const hasData = !!metrics && (metrics.trace_count > 0 || metrics.total_spans > 0);

  if (!sessionId) return null;

  return (
    <div className="border-b border-app-border bg-app-raised shrink-0">
      {/* Header bar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-app-bg/50 transition-colors"
      >
        <BarChart3 size={13} className="text-app-accent shrink-0" />
        <span className="text-[11px] font-semibold text-app-text">Session 指标</span>
        {collapsed ? (
          <ChevronDown size={12} className="text-app-faint shrink-0" />
        ) : (
          <ChevronUp size={12} className="text-app-faint shrink-0" />
        )}
        <span className="flex-1" />
        {metrics && (
          <div className="flex items-center gap-3 text-[10px] text-app-dim">
            <span className="flex items-center gap-1">
              <Zap size={9} /> {metrics.total_llm_calls} 次 LLM
            </span>
            <span className="flex items-center gap-1">
              <Coins size={9} /> {formatTokens(metrics.total_tokens)}
            </span>
            {metrics.total_errors > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertTriangle size={9} /> {metrics.total_errors} 错误
              </span>
            )}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="px-4 pb-3 pt-1">
          {loading && (
            <div className="text-[11px] text-app-dim animate-pulse py-2">加载指标…</div>
          )}
          {!loading && error && (
            <div className="text-[11px] text-red-500 py-2 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              {error}
            </div>
          )}
          {!loading && !error && !hasData && (
            <div className="text-[11px] text-app-dim py-2">暂无数据</div>
          )}
          {hasData && metrics && (
            <div className="space-y-3">
              {/* KPI cards */}
              <div className="grid grid-cols-4 gap-2">
                <MetricCard
                  icon={<Zap size={12} className="text-violet-600" />}
                  label="LLM 调用"
                  value={String(metrics.total_llm_calls)}
                  sub={`Tool ${metrics.total_tool_calls}`}
                  accent="border-l-violet-400"
                />
                <MetricCard
                  icon={<Coins size={12} className="text-amber-600" />}
                  label="总 Token"
                  value={formatTokens(metrics.total_tokens)}
                  sub={`入 ${formatTokens(metrics.total_prompt_tokens)} / 出 ${formatTokens(metrics.total_completion_tokens)}`}
                  accent="border-l-amber-400"
                />
                <MetricCard
                  icon={<Clock size={12} className="text-blue-600" />}
                  label="平均耗时"
                  value={formatDuration(metrics.avg_trace_duration_ms)}
                  sub={`P95 ${formatDuration(metrics.p95_trace_duration_ms)}`}
                  accent="border-l-blue-400"
                />
                <MetricCard
                  icon={<span className="text-[10px] text-green-600 font-mono">$</span>}
                  label="预估成本"
                  value={`$${metrics.estimated_cost_usd.toFixed(4)}`}
                  sub={`${metrics.trace_count} 条链路`}
                  accent="border-l-green-400"
                />
              </div>

              {/* Agent breakdown */}
              {metrics.agent_breakdown.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-app-dim uppercase tracking-wider mb-1.5">
                    Agent 消耗 breakdown
                  </div>
                  <div className="space-y-1.5">
                    {metrics.agent_breakdown.map((agent) => {
                      const maxTokens = metrics.agent_breakdown[0]?.tokens || 1;
                      const pct = Math.max(2, Math.round((agent.tokens / maxTokens) * 100));
                      return (
                        <div key={agent.agent_id} className="flex items-center gap-2">
                          <span className="text-[11px] text-app-text w-28 truncate shrink-0 font-medium" title={agent.agent_id}>
                            {agent.agent_id}
                          </span>
                          <div className="flex-1 h-4 bg-app-bg rounded-full overflow-hidden relative">
                            <div
                              className="absolute inset-y-0 left-0 bg-blue-400 rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-app-text font-mono">
                              {formatTokens(agent.tokens)} · {agent.llm_calls} LLM · {formatDuration(agent.duration_ms)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent = "border-l-transparent",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className={cn("bg-app-surface border border-app-border rounded-md px-2.5 py-2 shadow-card hover:border-app-muted/60 transition-colors border-l-[3px]", accent)}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] text-app-dim">{label}</span>
      </div>
      <div className="text-[14px] font-mono font-semibold text-app-text">{value}</div>
      <div className="text-[9px] text-app-faint mt-0.5">{sub}</div>
    </div>
  );
}
