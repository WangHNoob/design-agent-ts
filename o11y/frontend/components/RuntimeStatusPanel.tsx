"use client";

import { useEffect, useState, useMemo } from "react";
import { RuntimeStatus, TokenUsage } from "@/lib/api";
import { PHASE_META } from "@/lib/constants";

interface Props {
  sessionId: string | null;
  refreshTick: number;
}

interface CompressionEvent {
  timestamp: string;
  from: number;
  to: number;
  usagePct: number;
}

export default function RuntimeStatusPanel({ sessionId, refreshTick }: Props) {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [compressionLog, setCompressionLog] = useState<CompressionEvent[]>([]);
  const [tokenTotal, setTokenTotal] = useState<TokenUsage>({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });

  // ── SSE listener ─────────────────────────────────────────────────
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sse = new EventSource(`${base}/api/v1/events`);

    sse.addEventListener("runtime_status", (e) => {
      try {
        const d: RuntimeStatus = JSON.parse(e.data);
        if (sessionId && d.session_id !== sessionId) return;
        setStatus(d);

        // Accumulate token usage
        if (d.token_usage) {
          setTokenTotal((prev) => ({
            prompt_tokens: prev.prompt_tokens + d.token_usage!.prompt_tokens,
            completion_tokens: prev.completion_tokens + d.token_usage!.completion_tokens,
            total_tokens: prev.total_tokens + d.token_usage!.total_tokens,
          }));
        }

        // Record compression events
        if (d.context_compressed && d.compressed_from && d.compressed_to) {
          setCompressionLog((prev) =>
            [
              {
                timestamp: d.timestamp || new Date().toISOString(),
                from: d.compressed_from!,
                to: d.compressed_to!,
                usagePct: d.context_used_pct,
              },
              ...prev,
            ].slice(0, 8)
          );
        }

        // Reset token counter and compression log on new execution start
        if (d.current_phase === "PLANNING") {
          setTokenTotal({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
          setCompressionLog([]);
        }
      } catch {}
    });

    return () => sse.close();
  }, [sessionId]);

  // Reset when refreshTick changes (new session selected)
  useEffect(() => {
    setStatus(null);
    setTokenTotal({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
    setCompressionLog([]);
  }, [refreshTick]);

  // ── Helpers ──────────────────────────────────────────────────────
  const phase = status ? PHASE_META[status.current_phase] : null;

  const contextColor = useMemo(() => {
    const pct = status?.context_used_pct ?? 0;
    if (pct < 50) return "bg-emerald-400";
    if (pct < 70) return "bg-amber-400";
    if (pct < 90) return "bg-orange-400";
    return "bg-red-500";
  }, [status?.context_used_pct]);

  const formatPct = (v: number) => v.toFixed(1) + "%";

  // ── Idle state ───────────────────────────────────────────────────
  if (!sessionId || !status) {
    return (
      <div className="h-7 bg-app-raised border-b border-app-border flex items-center px-4">
        <span className="text-[10px] text-app-faint font-mono">
          {sessionId ? "等待执行..." : "选择一个会话查看运行状态"}
        </span>
      </div>
    );
  }

  // ── Active state ─────────────────────────────────────────────────
  return (
    <div className="bg-app-raised border-b border-app-border">
      <div className="h-7 flex items-center px-4 gap-4">
        {/* Phase badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${phase?.bg ?? "bg-app-muted"} ${phase?.color ?? "text-app-dim"}`}>
          {phase?.label ?? status.current_phase}
        </span>

        {/* Progress */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="w-24 h-1.5 bg-app-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-app-accent rounded-full transition-all duration-500"
              style={{ width: `${status.progress_pct}%` }}
            />
          </div>
          <span className="text-[10px] text-app-dim truncate max-w-xs">{status.step_description}</span>
        </div>

        {/* Context usage */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-app-faint font-mono">ctx</span>
          <div className="w-12 h-1.5 bg-app-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${contextColor}`}
              style={{ width: `${Math.min(status.context_used_pct, 100)}%` }}
            />
          </div>
          <span className={`text-[9px] font-mono ${contextColor.replace("bg-", "text-")}`}>
            {formatPct(status.context_used_pct)}
          </span>
        </div>

        {/* Token counter */}
        <div className="flex items-center gap-1 text-[9px] font-mono text-app-dim">
          <span className="text-app-faint">tok</span>
          <span>{tokenTotal.total_tokens.toLocaleString()}</span>
        </div>

        {/* Compression dot */}
        {compressionLog.length > 0 && (
          <span className="text-[9px] text-amber-400 font-mono" title={`最近压缩: ${compressionLog[0].from}→${compressionLog[0].to}`}>
            cmp×{compressionLog.length}
          </span>
        )}
      </div>
    </div>
  );
}
