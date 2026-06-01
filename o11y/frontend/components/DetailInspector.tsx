"use client";

import { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X, Copy, Check, ChevronDown, ChevronRight, Brain, Zap, Braces, AlertTriangle, ScrollText } from "lucide-react";
import { Span } from "@/lib/api";
import LogPanel from "./LogPanel";
import { cn, formatDuration, formatTime, shortId, formatTokens } from "@/lib/utils";
import { SPAN_TYPE_META, STATUS_META, THINKING_FIELDS, THINKING_META } from "@/lib/constants";

type TabId = "details" | "input" | "output" | "raw" | "logs";
type ViewMode = "formatted" | "raw";

interface Props {
  span: Span | null;
  onClose: () => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "details", label: "详情" },
  { id: "input", label: "入参" },
  { id: "output", label: "出参" },
  { id: "raw", label: "原始" },
  { id: "logs", label: "日志" },
];

// ── Recursive thinking content finder ──────────────────────────────────────

function findThinkingContent(data: any, visited = new Set<any>()): { key: string; value: string } | null {
  if (!data || typeof data !== "object") return null;
  if (visited.has(data)) return null;
  visited.add(data);

  for (const field of THINKING_FIELDS) {
    if (typeof data[field] === "string" && data[field].length > 0) {
      return { key: field, value: data[field] };
    }
  }

  // Check messages array (common for LLM input)
  if (Array.isArray(data.messages)) {
    for (const msg of data.messages) {
      const found = findThinkingContent(msg, visited);
      if (found) return found;
    }
  }

  // Check choices array (OpenAI-style output)
  if (Array.isArray(data.choices)) {
    for (const c of data.choices) {
      const found = findThinkingContent(c.message ?? c.delta ?? c, visited);
      if (found) return found;
    }
  }

  // One level of recursion into object values
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && !THINKING_FIELDS.includes(key)) {
      const found = findThinkingContent(value, visited);
      if (found) return found;
    }
  }

  return null;
}

// ── Extract thinking tokens ────────────────────────────────────────────────

function extractThinkingTokens(data: any): number | null {
  if (!data || typeof data !== "object") return null;
  // OpenAI style
  const od = data.usage?.completion_tokens_details;
  if (od?.reasoning_tokens != null) return od.reasoning_tokens;
  // Flat usage fields
  if (data.usage?.reasoning_tokens != null) return data.usage.reasoning_tokens;
  if (data.usage?.thinking_tokens != null) return data.usage.thinking_tokens;
  // Top-level
  if (data.reasoning_tokens != null) return data.reasoning_tokens;
  return null;
}

// ── Collapsible JSON tree ──────────────────────────────────────────────────

function isComplex(v: any): boolean {
  return v !== null && typeof v === "object";
}

function JsonNode({ data, depth }: { data: any; depth: number }) {
  const [open, setOpen] = useState(depth < 2);

  if (data === null) return <span className="jt-null">null</span>;
  if (typeof data === "boolean") return <span className="jt-bool">{String(data)}</span>;
  if (typeof data === "number") return <span className="jt-number">{String(data)}</span>;
  if (typeof data === "string") {
    const display = data.length > 200 ? JSON.stringify(data.slice(0, 200) + "…") : JSON.stringify(data);
    return <span className="jt-string">{display}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="jt-brace">[]</span>;
    if (!open) {
      return (
        <span>
          <span className="jt-toggle" role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(true); }}>
            <ChevronRight size={10} />
          </span>
          <span className="jt-brace">[</span>
          <span className="jt-ellipsis">…</span>
          <span className="jt-brace">]</span>
          <span className="jt-count"> {data.length} items</span>
        </span>
      );
    }
    return (
      <span>
        <span className="jt-toggle" role="button" tabIndex={0} onClick={() => setOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(false); }}>
          <ChevronDown size={10} />
        </span>
        <span className="jt-brace">[</span>
        <span className="jt-count"> {data.length} items</span>
        {data.map((item, i) => (
          <div key={i} className="jt-line" style={{ paddingLeft: (depth + 1) * 16 }}>
            <JsonNode data={item} depth={depth + 1} />
            {i < data.length - 1 && <span className="jt-brace">,</span>}
          </div>
        ))}
        <div className="jt-line" style={{ paddingLeft: depth * 16 }}>
          <span className="jt-brace">]</span>
        </div>
      </span>
    );
  }

  // Object
  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="jt-brace">{"{}"}</span>;
  if (!open) {
    return (
      <span>
        <span className="jt-toggle" role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(true); }}>
          <ChevronRight size={10} />
        </span>
        <span className="jt-brace">{"{"}</span>
        <span className="jt-ellipsis">…</span>
        <span className="jt-brace">{"}"}</span>
        <span className="jt-count"> {entries.length} keys</span>
      </span>
    );
  }
  return (
    <span>
      <span className="jt-toggle" role="button" tabIndex={0} onClick={() => setOpen(false)} onKeyDown={(e) => { if (e.key === 'Enter') setOpen(false); }}>
        <ChevronDown size={10} />
      </span>
      <span className="jt-brace">{"{"}</span>
      <span className="jt-count"> {entries.length} keys</span>
      {entries.map(([key, value], i) => (
        <div key={key} className="jt-line" style={{ paddingLeft: (depth + 1) * 16 }}>
          <span className="jt-key">"{key}"</span>
          <span className="jt-brace">: </span>
          {isComplex(value) ? (
            <JsonNode data={value} depth={depth + 1} />
          ) : (
            <JsonNode data={value} depth={depth + 1} />
          )}
          {i < entries.length - 1 && <span className="jt-brace">,</span>}
        </div>
      ))}
      <div className="jt-line" style={{ paddingLeft: depth * 16 }}>
        <span className="jt-brace">{"}"}</span>
      </div>
    </span>
  );
}

function safeStringify(data: any): string {
  if (data == null) return "";
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    try {
      // Fallback: use a replacer to remove circular references
      const seen = new WeakSet();
      return JSON.stringify(data, (key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      }, 2);
    } catch {
      return "[Unable to serialize]";
    }
  }
}

// ── Syntax-highlighted raw JSON ────────────────────────────────────────────

function highlightJson(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  // Safeguard: skip regex highlighting for very large inputs (>100KB)
  // to avoid backtracking blowup on strings with embedded markdown.
  if (text.length > 100_000) {
    return text;
  }

  // Use a local regex (no shared g state) with a safety bailout.
  // Split on major JSON tokens line-by-line to avoid catastrophic backtracking.
  const lines = text.split("\n");
  for (const line of lines) {
    const lineParts: React.ReactNode[] = [];
    let pos = 0;

    // Simple char-by-char tokenizer — avoids regex backtracking entirely.
    while (pos < line.length) {
      const c = line[pos];
      if (c === '"') {
        // Parse JSON string
        const start = pos;
        pos++;
        while (pos < line.length) {
          if (line[pos] === "\\") { pos += 2; continue; }
          if (line[pos] === '"') { pos++; break; }
          pos++;
        }
        const tok = line.slice(start, pos);
        // Check if followed by ':'
        const rest = line.slice(pos).trimStart();
        if (rest.startsWith(":")) {
          lineParts.push(<span key={key++} className="json-key">{tok}</span>);
          lineParts.push(<span key={key++} className="json-brace">:</span>);
          pos += rest.indexOf(":") + 1;
        } else {
          lineParts.push(<span key={key++} className="json-string">{tok}</span>);
        }
        continue;
      }
      if ((c >= "0" && c <= "9") || c === "-") {
        const start = pos;
        pos++;
        while (pos < line.length && /[\d.eE+\-]/.test(line[pos])) pos++;
        const num = line.slice(start, pos);
        lineParts.push(<span key={key++} className="json-number">{num}</span>);
        continue;
      }
      if (line.startsWith("true", pos)) { lineParts.push(<span key={key++} className="json-bool">true</span>); pos += 4; continue; }
      if (line.startsWith("false", pos)) { lineParts.push(<span key={key++} className="json-bool">false</span>); pos += 5; continue; }
      if (line.startsWith("null", pos)) { lineParts.push(<span key={key++} className="json-null">null</span>); pos += 4; continue; }
      if (c === "{" || c === "}" || c === "[" || c === "]" || c === ",") {
        lineParts.push(<span key={key++} className="json-brace">{c}</span>);
        pos++;
        continue;
      }
      pos++;
    }

    if (lineParts.length > 0) {
      if (parts.length > 0) parts.push("\n");
      parts.push(...lineParts);
    } else {
      parts.push(line);
    }
  }

  return parts.length > 0 ? parts : text;
}

// ── Thinking callout ───────────────────────────────────────────────────────

function ThinkingCallout({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(true);

  const looksLikeMarkdown = useMemo(() => /[#*`\[\]>\-]/.test(content) && content.length > 20, [content]);

  return (
    <div className="thinking-callout mb-3 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-500/5 transition-colors"
      >
        <Brain size={13} className="text-amber-400 shrink-0" />
        <span className="text-[12px] font-medium text-amber-300 flex-1">{THINKING_META.label}</span>
        {expanded ? <ChevronDown size={12} className="text-amber-500" /> : <ChevronRight size={12} className="text-amber-500" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0">
          {looksLikeMarkdown ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <pre className="text-[12px] text-amber-900 whitespace-pre-wrap font-mono leading-relaxed">
              {content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ── Smart content renderer (detects markdown vs JSON vs plain text) ────────

function SmartContent({ data }: { data: any }) {
  // String
  if (typeof data === "string") {
    const looksLikeMarkdown = data.length > 20 && /[#*`\[\]>\-]/.test(data);
    if (looksLikeMarkdown) {
      return (
        <div className="bg-app-raised border border-app-border rounded-md p-3 max-h-96 overflow-y-auto">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data}</ReactMarkdown>
          </div>
        </div>
      );
    }
    return (
      <pre className="text-[12px] text-app-text bg-app-raised border border-app-border rounded-md p-3 max-h-64 overflow-y-auto whitespace-pre-wrap">
        {data}
      </pre>
    );
  }

  // Object / array — show JSON tree
  return (
    <div className="json-tree bg-app-raised border border-app-border rounded-md p-3 max-h-96 overflow-y-auto">
      <JsonNode data={data} depth={0} />
    </div>
  );
}

// ── Tab: Details ───────────────────────────────────────────────────────────

function DetailsTab({
  span,
  meta,
  status,
  thinkingTokens,
}: {
  span: Span;
  meta: { label: string; color: string; bg: string; border: string };
  status: { label: string; color: string; dot: string };
  thinkingTokens: number | null;
}) {
  const promptTokens = span.input_data?.usage?.prompt_tokens ?? span.input_data?.prompt_tokens ?? null;
  const completionTokens = span.input_data?.usage?.completion_tokens ?? span.input_data?.completion_tokens ?? null;

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-[11px] font-semibold tracking-wider uppercase text-app-dim mb-2">基本信息</h4>
        <div className="space-y-1">
          <InfoRow label="名称" value={span.name} />
          <InfoRow label="类型">
            <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", meta.bg, meta.color)}>{meta.label}</span>
          </InfoRow>
          <InfoRow label="状态">
            <span className={cn("text-[12px]", status.color)}>{status.label}</span>
          </InfoRow>
          <InfoRow label="耗时" value={formatDuration(span.duration_ms)} mono />
          <InfoRow label="步骤 ID" value={shortId(span.id)} mono />
          {span.parent_span_id && <InfoRow label="父步骤" value={shortId(span.parent_span_id)} mono />}
          <InfoRow label="开始时间" value={formatTime(span.start_time)} />
        </div>
      </section>

      {/* Error callout */}
      {span.status === "error" && span.error_message && (
        <section className="bg-red-50 border border-red-300 rounded-md p-3">
          <h4 className="text-[11px] font-semibold text-red-600 mb-1 flex items-center gap-1">
            <AlertTriangle size={12} /> 错误详情
          </h4>
          <p className="text-[12px] text-red-700 whitespace-pre-wrap break-words">
            {span.error_message}
          </p>
        </section>
      )}

      {/* Token summary */}
      {(promptTokens != null || completionTokens != null || thinkingTokens != null) && (
        <section>
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-app-dim mb-2">Token 用量</h4>
          <div className="grid grid-cols-2 gap-2">
            {promptTokens != null && (
              <div className="bg-app-raised border border-app-border rounded-md p-2.5 text-center">
                <div className="text-[10px] text-app-dim mb-0.5">输入</div>
                <div className="text-[15px] font-mono font-semibold text-blue-400">{formatTokens(promptTokens)}</div>
              </div>
            )}
            {completionTokens != null && (
              <div className="bg-app-raised border border-app-border rounded-md p-2.5 text-center">
                <div className="text-[10px] text-app-dim mb-0.5">输出</div>
                <div className="text-[15px] font-mono font-semibold text-green-400">{formatTokens(completionTokens)}</div>
              </div>
            )}
            {thinkingTokens != null && (
              <div className="bg-amber-50 border border-amber-300 rounded-md p-2.5 text-center col-span-2">
                <div className="text-[10px] text-app-dim mb-0.5">思考</div>
                <div className="text-[15px] font-mono font-semibold text-amber-300">{formatTokens(thinkingTokens)}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Prompt version */}
      {span.metadata?.prompt_version && (
        <section>
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-app-dim mb-2">Prompt 版本</h4>
          <div className="bg-app-raised border border-app-border rounded-md p-2.5 flex items-center gap-2">
            <span className="text-[10px] text-app-dim">SHA-256</span>
            <span className="text-[12px] font-mono text-app-accent">{span.metadata.prompt_version}</span>
          </div>
        </section>
      )}

      {/* HITL specific info */}
      {span.span_type === "HITL" && (
        <section className="bg-rose-50 border border-rose-200 rounded-md p-3">
          <h4 className="text-[11px] font-semibold text-rose-400 mb-2">人工审核详情</h4>
          <div className="space-y-1 text-[11px]">
            <InfoRow label="等待时长" value={formatDuration(span.duration_ms)} mono />
            {span.input_data && (
              <div className="mt-2">
                <div className="text-app-dim mb-1">审核前内容</div>
                <pre className="text-[11px] text-app-text bg-app-raised border border-app-border rounded-md p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {typeof span.input_data === "string" ? span.input_data : JSON.stringify(span.input_data, null, 2)}
                </pre>
              </div>
            )}
            {span.output_data && (
              <div className="mt-2">
                <div className="text-app-dim mb-1">审核后内容</div>
                <pre className="text-[11px] text-app-text bg-app-raised border border-app-border rounded-md p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {typeof span.output_data === "string" ? span.output_data : JSON.stringify(span.output_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Metadata */}
      {span.metadata && (
        <section>
          <h4 className="text-[11px] font-semibold tracking-wider uppercase text-app-dim mb-2">元数据</h4>
          <div className="json-tree bg-app-raised border border-app-border rounded-md p-3 max-h-64 overflow-y-auto">
            <JsonNode data={span.metadata} depth={0} />
          </div>
        </section>
      )}
    </div>
  );
}

// ── Tab: Input / Output data ───────────────────────────────────────────────

function DataTab({
  data,
  thinking,
  viewMode,
  onViewModeChange,
  onCopy,
  copied,
}: {
  data: any;
  thinking: { key: string; value: string } | null;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const rawJson = useMemo(() => safeStringify(data), [data]);
  const highlighted = useMemo(() => highlightJson(rawJson), [rawJson]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="view-toggle">
          <button
            className={viewMode === "formatted" ? "active" : ""}
            onClick={() => onViewModeChange("formatted")}
          >
            <Braces size={10} className="inline mr-1" />
            格式化
          </button>
          <button
            className={viewMode === "raw" ? "active" : ""}
            onClick={() => onViewModeChange("raw")}
          >
            源码
          </button>
        </div>
        <button
          onClick={() => onCopy(rawJson)}
          className="text-[10px] text-app-dim hover:text-app-text flex items-center gap-1"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>

      {/* Thinking callout (formatted mode only) */}
      {viewMode === "formatted" && thinking && (
        <ThinkingCallout content={thinking.value} />
      )}

      {/* Content */}
      {viewMode === "formatted" ? (
        <SmartContent data={data} />
      ) : (
        <pre className="text-[11px] font-mono text-app-text bg-app-raised border border-app-border rounded-md p-3 max-h-96 overflow-y-auto whitespace-pre-wrap json-viewer">
          {highlighted}
        </pre>
      )}
    </div>
  );
}

// ── Tab: Raw span JSON ─────────────────────────────────────────────────────

function RawTab({
  span,
  onCopy,
  copied,
}: {
  span: Span;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  const rawJson = useMemo(() => JSON.stringify(span, null, 2), [span]);
  const highlighted = useMemo(() => highlightJson(rawJson), [rawJson]);

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          onClick={() => onCopy(rawJson)}
          className="text-[10px] text-app-dim hover:text-app-text flex items-center gap-1"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="text-[11px] font-mono text-app-text bg-app-raised border border-app-border rounded-md p-3 max-h-[calc(100vh-220px)] overflow-y-auto whitespace-pre-wrap json-viewer">
        {highlighted}
      </pre>
    </div>
  );
}

// ── Utility: Info row ──────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  children,
  mono,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px] text-app-dim">{label}</span>
      {children ?? (
        <span className={cn("text-[12px] text-app-text", mono && "font-mono text-[11px]")}>
          {value || "—"}
        </span>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function DetailInspector({ span, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [viewMode, setViewMode] = useState<ViewMode>("formatted");
  const [copied, setCopied] = useState(false);

  if (!span) return null;

  const meta = SPAN_TYPE_META[span.span_type] ?? SPAN_TYPE_META.STEP;
  const status = STATUS_META[span.status] ?? STATUS_META.ok;

  const inputThinking = useMemo(
    () => (span.input_data ? findThinkingContent(span.input_data) : null),
    [span.input_data]
  );
  const outputThinking = useMemo(
    () => (span.output_data ? findThinkingContent(span.output_data) : null),
    [span.output_data]
  );
  const thinkingTokens = useMemo(
    () => extractThinkingTokens(span.input_data) ?? extractThinkingTokens(span.output_data),
    [span.input_data, span.output_data]
  );

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Filter to available tabs
  const availableTabs = TABS.filter((t) => {
    if (t.id === "input" && !span.input_data) return false;
    if (t.id === "output" && !span.output_data) return false;
    return true;
  });

  const currentTab = availableTabs.find((t) => t.id === activeTab) ? activeTab : availableTabs[0]?.id ?? "details";

  return (
    <div className="w-96 shrink-0 border-l border-app-border bg-app-surface shadow-lg animate-slide-left flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-app-border flex items-center gap-2 shrink-0">
        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded", meta.bg, meta.color)}>
          {meta.label}
        </span>
        <h3 className="text-[13px] font-semibold text-app-text flex-1 truncate">{span.name}</h3>
        <button onClick={onClose} className="text-app-dim hover:text-app-text transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-app-border shrink-0">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 text-[12px] py-2 font-medium transition-colors border-b-2",
              currentTab === tab.id
                ? "border-app-accent text-app-text"
                : "border-transparent text-app-dim hover:text-app-text"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {currentTab === "details" && (
          <DetailsTab span={span} meta={meta} status={status} thinkingTokens={thinkingTokens} />
        )}
        {currentTab === "input" && span.input_data && (
          <DataTab
            data={span.input_data}
            thinking={inputThinking}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCopy={handleCopy}
            copied={copied}
          />
        )}
        {currentTab === "output" && span.output_data && (
          <DataTab
            data={span.output_data}
            thinking={outputThinking}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCopy={handleCopy}
            copied={copied}
          />
        )}
        {currentTab === "raw" && <RawTab span={span} onCopy={handleCopy} copied={copied} />}
        {currentTab === "logs" && <LogPanel spanId={span.id} />}
      </div>
    </div>
  );
}
