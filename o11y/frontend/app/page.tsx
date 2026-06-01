"use client";

import { useEffect, useState } from "react";
import { Activity, Satellite } from "lucide-react";
import { Session, Span } from "@/lib/api";
import SessionSidebar from "@/components/SessionSidebar";
import TraceWaterfall from "@/components/TraceWaterfall";
import DetailInspector from "@/components/DetailInspector";
import TraceSelector from "@/components/TraceSelector";
import RuntimeStatusPanel from "@/components/RuntimeStatusPanel";
import SessionMetricsPanel from "@/components/SessionMetricsPanel";

export default function Home() {
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [connected, setConnected] = useState(false);

  // ── SSE ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const sse = new EventSource(`${base}/api/v1/events`);

    sse.onopen = () => setConnected(true);
    sse.onerror = () => setConnected(false);

    const bump = () => setRefreshTick((t) => t + 1);
    sse.addEventListener("session", bump);
    sse.addEventListener("trace", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (!selectedSession || d.session_id === selectedSession.id) bump();
      } catch {
        bump();
      }
    });
    sse.addEventListener("span_batch", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (!selectedTraceId || d.trace_id === selectedTraceId) bump();
      } catch {
        bump();
      }
    });

    return () => sse.close();
  }, [selectedSession?.id, selectedTraceId]);

  // ── Selection handlers ──────────────────────────────────────────────────
  const handleSessionSelect = (s: Session) => {
    setSelectedSession(s);
    setSelectedTraceId(null);
    setSelectedSpan(null);
  };

  const handleTraceSelect = (traceId: string) => {
    setSelectedTraceId(traceId);
    setSelectedSpan(null);
  };

  const handleSpanSelect = (span: Span) => {
    setSelectedSpan(span);
  };

  // ── Layout ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col bg-app-bg text-app-text font-ui relative z-10">
      {/* Top bar */}
      <header className="h-9 shrink-0 bg-app-surface border-b border-app-border flex items-center px-4 gap-3 shadow-card">
        <Activity size={14} className="text-app-accent" />
        <span className="text-[11px] font-semibold tracking-widest uppercase text-app-dim">
          O11y 可观测性控制台
        </span>
        <span className="flex-1" />
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? "bg-emerald-500 animate-pulse-dot" : "bg-amber-500"
          }`}
        />
        <span className="text-[10px] text-app-dim">
          {connected ? "实时连接" : "连接断开"}
        </span>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Session Sidebar */}
        <div className="w-60 shrink-0">
          <SessionSidebar
            selectedId={selectedSession?.id ?? null}
            onSelect={handleSessionSelect}
            refreshTick={refreshTick}
          />
        </div>

        {/* Center: Trace area + Logs */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Runtime status panel */}
          <RuntimeStatusPanel
            sessionId={selectedSession?.id ?? null}
            refreshTick={refreshTick}
          />

          {/* Session metrics panel */}
          <SessionMetricsPanel
            sessionId={selectedSession?.id ?? null}
            refreshTick={refreshTick}
          />

          {/* Trace selector bar */}
          {selectedSession && (
            <TraceSelector
              sessionId={selectedSession.id}
              selectedTraceId={selectedTraceId}
              onSelect={handleTraceSelect}
              refreshTick={refreshTick}
            />
          )}

          {/* Center body: Waterfall */}
          <div className="flex-1 flex overflow-hidden">
            <TraceWaterfall
              traceId={selectedTraceId}
              refreshTick={refreshTick}
              onSpanSelect={handleSpanSelect}
              selectedSpanId={selectedSpan?.id ?? null}
            />
          </div>
        </div>

        {/* Right: Detail Inspector */}
        {selectedSpan && (
          <DetailInspector span={selectedSpan} onClose={() => setSelectedSpan(null)} />
        )}
      </div>

      {/* Deerflow branding — subtle corner badge */}
      <a
        href="https://deerflow.tech"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-3 left-[248px] z-50 flex items-center gap-1 text-[10px] text-app-faint hover:text-app-accent transition-colors duration-300 select-none"
        title="Created By Deerflow"
      >
        <Satellite size={10} />
        <span className="tracking-wide">Deerflow</span>
      </a>
    </div>
  );
}
