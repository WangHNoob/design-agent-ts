"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronDown, AlertTriangle, Zap, Brain, List, BarChart3, UserCheck } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiClient, Span, Trace } from "@/lib/api";
import { cn, formatDuration, formatTime, formatTokens, shortId } from "@/lib/utils";
import { SPAN_TYPE_META, STATUS_META } from "@/lib/constants";
import TraceStatsBar from "./TraceStatsBar";
import TraceFlameGraph from "./TraceFlameGraph";

interface Props {
  traceId: string | null;
  refreshTick: number;
  onSpanSelect: (span: Span) => void;
  selectedSpanId: string | null;
}

// ── Build tree ────────────────────────────────────────────────────────────
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

// ── Flatten tree for virtualization ─────────────────────────────────────────
interface FlatItem {
  span: Span;
  depth: number;
}

function flattenTree(roots: Span[], collapsed: Set<string>): FlatItem[] {
  const result: FlatItem[] = [];
  function walk(nodes: Span[], depth: number) {
    for (const span of nodes) {
      result.push({ span, depth });
      if (span.children && span.children.length > 0 && !collapsed.has(span.id)) {
        walk(span.children, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return result;
}

function durationBar(ms: number | null, maxMs: number): string {
  if (ms == null || maxMs === 0) return "0%";
  return Math.max(2, Math.round((ms / maxMs) * 100)) + "%";
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TraceWaterfall({ traceId, refreshTick, onSpanSelect, selectedSpanId }: Props) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"tree" | "flame">("tree");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiClient
      .getTrace(traceId)
      .then(setTrace)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [traceId, refreshTick]);

  // Auto-expand errored spans on trace load
  useEffect(() => {
    if (!trace?.spans) return;
    const errorIds = new Set(
      trace.spans.filter((s) => s.status === "error").map((s) => s.id)
    );
    if (errorIds.size === 0) return;
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const id of errorIds) next.delete(id);
      return next;
    });
  }, [trace?.id]);

  const tree = useMemo(() => {
    if (!trace?.spans?.length) return [];
    return buildSpanTree(trace.spans);
  }, [trace]);

  const flatList = useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const maxMs = useMemo(() => {
    let max = 0;
    for (const s of trace?.spans ?? []) {
      if (s.duration_ms != null && s.duration_ms > max) max = s.duration_ms;
    }
    return max;
  }, [trace]);

  const toggleCollapse = (spanId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  const virtualizer = useVirtualizer({
    count: flatList.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 10,
  });

  // Empty / loading
  if (!traceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-app-dim text-[13px]">
        选择一个链路查看详情
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-[13px] text-app-dim animate-pulse">加载链路…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 text-[13px]">
        加载失败: {error}
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex-1 flex items-center justify-center text-app-dim text-[13px]">
        链路未找到
      </div>
    );
  }

  const status = STATUS_META[trace.status] ?? STATUS_META.ok;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-app-surface">
      {/* Trace header */}
      <div className="px-4 py-3 border-b border-app-border bg-app-raised shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <h2 className="text-sm font-semibold text-app-text truncate flex-1">
            {trace.name || `链路 ${shortId(trace.id)}`}
          </h2>
          <span className={cn("text-[11px] font-medium", status.color)}>
            {status.label}
          </span>
          {trace.duration_ms != null && (
            <span className="text-[11px] text-app-dim font-mono">
              {formatDuration(trace.duration_ms)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-app-faint">
            <span>ID: {shortId(trace.id)}</span>
            <span>{trace.spans?.length ?? 0} 个步骤</span>
            <span>{formatTime(trace.start_time)}</span>
          </div>
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-app-raised rounded-md border border-app-border p-0.5 shadow-inner-light">
            <button
              onClick={() => setViewMode("tree")}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors",
                viewMode === "tree"
                  ? "bg-sky-100 text-app-accent font-medium"
                  : "text-app-dim hover:text-app-text"
              )}
              title="树形列表"
            >
              <List size={11} />
              列表
            </button>
            <button
              onClick={() => setViewMode("flame")}
              className={cn(
                "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors",
                viewMode === "flame"
                  ? "bg-sky-100 text-app-accent font-medium"
                  : "text-app-dim hover:text-app-text"
              )}
              title="火焰图"
            >
              <BarChart3 size={11} />
              火焰图
            </button>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {trace.stats && <TraceStatsBar stats={trace.stats} />}

      {/* View content */}
      {viewMode === "flame" ? (
        <TraceFlameGraph
          trace={trace}
          onSpanSelect={onSpanSelect}
          selectedSpanId={selectedSpanId}
        />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {flatList.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-app-dim">
              暂无步骤记录
            </div>
          ) : (
            <div className="py-1" style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const { span, depth } = flatList[vItem.index];
                const hasChildren = span.children && span.children.length > 0;
                const meta = SPAN_TYPE_META[span.span_type] ?? SPAN_TYPE_META.STEP;
                const spanStatus = STATUS_META[span.status] ?? STATUS_META.ok;
                const isRunning = span.status === "running";
                const isSlow = span.duration_ms != null && span.duration_ms > 30_000;
                const isError = span.status === "error";
                const selected = span.id === selectedSpanId;
                const isExpanded = !collapsed.has(span.id);

                // Token extraction
                const data = span.input_data ?? span.output_data ?? {};
                const prompt = data.usage?.prompt_tokens ?? data.prompt_tokens ?? null;
                const completion = data.usage?.completion_tokens ?? data.completion_tokens ?? null;
                const details = data.usage?.completion_tokens_details;
                const thinking = details?.reasoning_tokens ?? data.usage?.reasoning_tokens ?? data.usage?.thinking_tokens ?? data.reasoning_tokens ?? null;
                const hasThinkingContent = (span.input_data && /reasoning_content|thinking|reasoning/.test(typeof span.input_data === "string" ? span.input_data.slice(0, 5000) : JSON.stringify(span.input_data).slice(0, 5000))) ||
                  (span.output_data && /reasoning_content|thinking|reasoning/.test(typeof span.output_data === "string" ? span.output_data.slice(0, 5000) : JSON.stringify(span.output_data).slice(0, 5000)));

                return (
                  <div
                    key={span.id}
                    className="absolute top-0 left-0 w-full"
                    style={{ height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                  >
                    <button
                      onClick={() => onSpanSelect(span)}
                      className={cn(
                        "w-full text-left group flex items-center gap-1.5 py-1.5 px-2 border-l-[3px] transition-all duration-150 text-[13px]",
                        selected
                          ? "border-blue-500 bg-blue-100 shadow-[inset_2px_0_0_rgba(59,130,246,0.15)]"
                          : "border-transparent hover:bg-app-raised",
                        isSlow && "border-l-amber-500 animate-perf-warn",
                        isError && !selected && "border-l-red-500 bg-red-100"
                      )}
                      style={{ paddingLeft: depth * 18 + 8 }}
                    >
                      <span className="w-4 shrink-0 flex items-center justify-center">
                        {hasChildren ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapse(span.id);
                            }}
                            className="cursor-pointer text-app-faint hover:text-app-text"
                            role="button"
                            tabIndex={0}
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </span>
                        ) : (
                          <span className="w-3" />
                        )}
                      </span>

                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap border",
                          meta.bg,
                          meta.color,
                          meta.border
                        )}
                      >
                        {meta.label}
                      </span>

                      {span.span_type === "HITL" && <span title="人工审核"><UserCheck size={12} className="text-rose-600 shrink-0" /></span>}
                      <span className="truncate flex-1 text-app-text">{span.name}</span>

                      {isError && span.error_message && (
                        <span className="text-[10px] text-red-600 truncate max-w-[200px] shrink-0" title={span.error_message}>
                          {span.error_message}
                        </span>
                      )}

                      {hasThinkingContent && (
                        <span title="含思考过程"><Brain size={11} className="text-amber-600 shrink-0" /></span>
                      )}

                      {span.span_type === "LLM" && thinking != null && (
                        <span className="text-[10px] text-amber-400 font-mono shrink-0" title="思考 Token">
                          <Brain size={10} className="inline mr-0.5" />
                          {formatTokens(thinking)}
                        </span>
                      )}

                      {span.span_type === "LLM" && (prompt || completion) && (
                        <span className="text-[10px] text-app-dim font-mono shrink-0">
                          <Zap size={9} className="inline mr-0.5 text-app-faint" />
                          {prompt != null && `入 ${formatTokens(prompt)}`}
                          {prompt != null && completion != null && " / "}
                          {completion != null && `出 ${formatTokens(completion)}`}
                        </span>
                      )}

                      <span className="shrink-0 w-16 relative h-3 flex items-center">
                        <span className="absolute inset-y-0 right-0 left-0 bg-app-raised rounded-full overflow-hidden">
                          <span
                            className={cn("absolute inset-y-0 left-0 rounded-full", meta.color.replace("text-", "bg-"))}
                            style={{ width: durationBar(span.duration_ms, maxMs) }}
                          />
                        </span>
                      </span>

                      <span className="text-[11px] text-app-dim font-mono w-16 text-right shrink-0">
                        {formatDuration(span.duration_ms)}
                      </span>

                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", spanStatus.dot)} />

                      {isSlow && (
                        <span title={`耗时超过 30 秒 (${formatDuration(span.duration_ms)})`}>
                          <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                        </span>
                      )}

                      {isRunning && (
                        <span className="w-3 h-3 rounded-full border border-app-accent/50 animate-running shrink-0" title="运行中" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
