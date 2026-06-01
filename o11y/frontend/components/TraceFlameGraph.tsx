"use client";

import { useMemo, useRef, useState } from "react";
import { Span, Trace } from "@/lib/api";
import { cn, formatDuration, formatTime, formatTokens } from "@/lib/utils";
import { SPAN_TYPE_META, STATUS_META } from "@/lib/constants";

interface Props {
  trace: Trace;
  onSpanSelect: (span: Span) => void;
  selectedSpanId: string | null;
}

// ── Build tree & flatten ──────────────────────────────────────────────────

function buildSpanTree(spans: Span[]): Span[] {
  const map = new Map<string, Span>();
  const roots: Span[] = [];
  for (const s of spans) {
    s.children = [];
    map.set(s.id, s);
  }
  for (const s of spans) {
    if (s.parent_span_id && map.has(s.parent_span_id)) {
      map.get(s.parent_span_id)!.children!.push(s);
    } else {
      roots.push(s);
    }
  }
  return roots;
}

interface FlatItem {
  span: Span;
  depth: number;
}

function flattenTree(roots: Span[]): FlatItem[] {
  const result: FlatItem[] = [];
  function walk(nodes: Span[], depth: number) {
    for (const span of nodes) {
      result.push({ span, depth });
      if (span.children && span.children.length > 0) {
        walk(span.children, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return result;
}

// ── Time helpers ───────────────────────────────────────────────────────────

function parseTime(iso: string): number {
  return new Date(iso).getTime();
}

function formatTimeAxis(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function getTicks(totalMs: number): number[] {
  if (totalMs <= 0) return [0];
  let count = 10;
  let step = totalMs / count;
  // Round step to nice number
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  const rem = step / mag;
  let nice: number;
  if (rem < 1.5) nice = 1 * mag;
  else if (rem < 3) nice = 2 * mag;
  else if (rem < 7) nice = 5 * mag;
  else nice = 10 * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs + 0.001; t += nice) {
    ticks.push(Math.round(t));
  }
  return ticks;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function TraceFlameGraph({ trace, onSpanSelect, selectedSpanId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredSpanId, setHoveredSpanId] = useState<string | null>(null);

  const traceStart = useMemo(() => parseTime(trace.start_time), [trace.start_time]);
  const traceEnd = useMemo(() => {
    if (trace.end_time) return parseTime(trace.end_time);
    const now = Date.now();
    let max = now;
    for (const s of trace.spans ?? []) {
      if (s.end_time) {
        const t = parseTime(s.end_time);
        if (t > max) max = t;
      }
    }
    return max;
  }, [trace]);

  const totalMs = Math.max(traceEnd - traceStart, 1);
  const ticks = useMemo(() => getTicks(totalMs), [totalMs]);

  const tree = useMemo(() => buildSpanTree(trace.spans ?? []), [trace.spans]);
  const flatList = useMemo(() => flattenTree(tree), [tree]);

  const ROW_HEIGHT = 32;
  const AXIS_HEIGHT = 28;
  const LEFT_MARGIN = 160;
  const MIN_CHART_WIDTH = 600;

  // Tooltip data
  const hoveredSpan = useMemo(
    () => flatList.find((f) => f.span.id === hoveredSpanId)?.span ?? null,
    [flatList, hoveredSpanId]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
      {/* Trace header */}
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-sm font-semibold text-slate-100 truncate flex-1">
            {trace.name || `链路 ${trace.id.slice(0, 8)}`}
          </h2>
          <span className="text-[11px] text-slate-400 font-mono">
            {formatDuration(totalMs)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span>{trace.spans?.length ?? 0} 个步骤</span>
          <span>{formatTime(trace.start_time)}</span>
        </div>
      </div>

      {/* Flame chart */}
      <div ref={containerRef} className="flex-1 overflow-auto relative">
        <div style={{ minWidth: `${LEFT_MARGIN + MIN_CHART_WIDTH}px`, position: "relative" }}>
          {/* Time axis */}
          <div
            className="sticky top-0 z-20 bg-slate-800/95 border-b border-slate-700 h-7 flex items-end select-none"
            style={{ marginLeft: LEFT_MARGIN }}
          >
            {ticks.map((t) => {
              const left = (t / totalMs) * 100;
              return (
                <div
                  key={t}
                  className="absolute bottom-0 flex flex-col items-center"
                  style={{ left: `${left}%`, transform: "translateX(-50%)" }}
                >
                  <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap mb-0.5">
                    {formatTimeAxis(t)}
                  </span>
                  <span className="w-px h-1.5 bg-slate-600" />
                </div>
              );
            })}
          </div>

          {/* Span rows */}
          <div style={{ paddingTop: 4, paddingBottom: 4 }}>
            {flatList.map(({ span, depth }) => {
              const meta = SPAN_TYPE_META[span.span_type] ?? SPAN_TYPE_META.STEP;
              const status = STATUS_META[span.status] ?? STATUS_META.ok;
              const isRunning = span.status === "running";
              const selected = span.id === selectedSpanId;
              const hovered = span.id === hoveredSpanId;

              const sStart = parseTime(span.start_time);
              const offsetMs = sStart - traceStart;
              let durationMs = span.duration_ms ?? 0;
              if (isRunning) {
                durationMs = Date.now() - sStart;
              }
              if (durationMs < 0) durationMs = 0;

              const leftPct = (offsetMs / totalMs) * 100;
              const widthPct = (durationMs / totalMs) * 100;
              const minWidthPct = durationMs > 0 ? 0.3 : 0;

              // Token extraction
              const data = span.input_data ?? span.output_data ?? {};
              const prompt = data.usage?.prompt_tokens ?? data.prompt_tokens ?? null;
              const completion = data.usage?.completion_tokens ?? data.completion_tokens ?? null;

              return (
                <div
                  key={span.id}
                  className={cn(
                    "flex items-center group transition-colors hover:bg-slate-800/60",
                    selected && "bg-slate-700"
                  )}
                  style={{ height: ROW_HEIGHT }}
                  onMouseEnter={() => setHoveredSpanId(span.id)}
                  onMouseLeave={() => setHoveredSpanId((id) => (id === span.id ? null : id))}
                  onClick={() => onSpanSelect(span)}
                >
                  {/* Label column */}
                  <div
                    className="shrink-0 pr-2 pl-2 truncate text-[12px] text-slate-200 flex items-center gap-1 cursor-pointer hover:text-sky-400"
                    style={{ width: LEFT_MARGIN, paddingLeft: 8 + depth * 14 }}
                    title={span.name}
                  >
                    <span
                      className={cn(
                        "text-[9px] font-semibold px-1 py-0 rounded shrink-0 border",
                        "bg-slate-700 border-slate-600",
                        meta.color.replace("700", "400")
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="truncate">{span.name}</span>
                    {span.status === "error" && (
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", status.dot)} />
                    )}
                  </div>

                  {/* Bar column */}
                  <div className="flex-1 relative" style={{ height: ROW_HEIGHT }}>
                    {/* Grid lines */}
                    {ticks.map((t) => (
                      <div
                        key={`grid-${t}`}
                        className="absolute top-0 bottom-0 w-px bg-slate-700"
                        style={{ left: `${(t / totalMs) * 100}%` }}
                      />
                    ))}

                    {/* Span bar */}
                    <div
                      className={cn(
                        "absolute top-1.5 bottom-1.5 rounded cursor-pointer transition-all",
                        meta.color.replace("text-", "bg-").replace("700", "400"),
                        hovered && "ring-2 ring-sky-400 brightness-110",
                        isRunning && "animate-pulse"
                      )}
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, minWidthPct)}%`,
                        opacity: 1,
                      }}
                    >
                      {/* Bar label (inside if wide enough) */}
                      {widthPct > 8 && (
                        <span className="absolute inset-0 flex items-center px-1.5 text-[10px] text-white font-medium truncate drop-shadow-sm">
                          {formatDuration(span.duration_ms)}
                          {span.span_type === "LLM" && prompt != null && (
                            <span className="ml-1 opacity-80">
                              {formatTokens(prompt)}
                              {completion != null && `→${formatTokens(completion)}`}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Bar label (outside if too narrow) */}
                    {widthPct <= 8 && durationMs > 0 && (
                      <span className="absolute top-1.5 text-[10px] text-slate-400 font-mono whitespace-nowrap" style={{ left: `${leftPct + widthPct + 0.5}%` }}>
                        {formatDuration(span.duration_ms)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredSpan && (
        <div className="fixed z-50 pointer-events-none bg-slate-800 border border-slate-600 rounded-md shadow-lg px-3 py-2 text-[11px] max-w-xs">
          <div className="font-semibold text-slate-100 mb-1">{hoveredSpan.name}</div>
          <div className="text-slate-400 space-y-0.5">
            <div>类型: {SPAN_TYPE_META[hoveredSpan.span_type]?.label || hoveredSpan.span_type}</div>
            <div>耗时: {formatDuration(hoveredSpan.duration_ms)}</div>
            <div>状态: {STATUS_META[hoveredSpan.status]?.label || hoveredSpan.status}</div>
            {hoveredSpan.error_message && (
              <div className="text-red-600 truncate">{hoveredSpan.error_message}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
