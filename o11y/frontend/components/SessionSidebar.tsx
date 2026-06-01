"use client";

import { useEffect, useRef, useState } from "react";
import { Search, MessageSquare, Clock, Zap, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { apiClient, Session } from "@/lib/api";
import { formatTime, shortId } from "@/lib/utils";

interface Props {
  selectedId: string | null;
  onSelect: (s: Session) => void;
  refreshTick: number;
}

export default function SessionSidebar({ selectedId, onSelect, refreshTick }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient.listSessions().then(setSessions).finally(() => setLoading(false));
  }, [refreshTick]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(sessionId);
    try {
      await apiClient.deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // keep deleting state so we don't retry on stale UI
    } finally {
      setDeleting(null);
    }
  };

  const filtered = search
    ? sessions.filter((s) => {
        const needle = search.toLowerCase();
        return (
          (s.name && s.name.toLowerCase().includes(needle)) ||
          s.id.toLowerCase().includes(needle)
        );
      })
    : sessions;

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  return (
    <aside className="h-full flex flex-col bg-app-surface border-r border-app-border shadow-card">
      {/* Header */}
      <div className="px-3 py-3 border-b border-app-border shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={14} className="text-app-accent" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-app-dim">
            会话列表
          </span>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-app-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索会话…"
            className="w-full bg-app-bg border border-app-border rounded-md pl-7 pr-2 py-1.5 text-[12px] text-app-text placeholder:text-app-faint focus:outline-none focus:border-app-accent/60 focus:ring-1 focus:ring-app-accent/15 transition-all"
          />
        </div>
      </div>

      {/* Virtualized list */}
      <nav ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-6 text-center text-[12px] text-app-dim animate-pulse">
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-app-dim">
            {search ? "无匹配会话" : "等待数据…"}
          </div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const s = filtered[vItem.index];
              const active = s.id === selectedId;

              return (
                <div
                  key={s.id}
                  className="absolute top-0 left-0 w-full"
                  style={{ height: `${vItem.size}px`, transform: `translateY(${vItem.start}px)` }}
                >
                  <button
                    onClick={() => onSelect(s)}
                    className={`w-full text-left px-3 py-2.5 border-l-[3px] transition-all duration-150 group/item ${
                      active
                        ? "border-blue-500 bg-blue-100 text-app-text shadow-[inset_2px_0_0_rgba(59,130,246,0.12)]"
                        : "border-transparent hover:bg-app-raised text-app-dim hover:text-app-text"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <div className="text-[13px] leading-tight mb-0.5 truncate flex-1 font-medium">
                        {s.name || shortId(s.id)}
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleDelete(e, s.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(e as any, s.id); }}
                        className="shrink-0 opacity-0 group-hover/item:opacity-100 text-app-faint hover:text-red-500 transition-all cursor-pointer"
                        title="删除会话"
                      >
                        {deleting === s.id ? (
                          <span className="text-[10px]">…</span>
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-app-faint">
                      <Clock size={10} />
                      <span>{formatTime(s.created_at)}</span>
                      {s.traces?.length > 0 && (
                        <>
                          <span>·</span>
                          <Zap size={10} className="text-app-accent/80" />
                          <span>{s.traces.length} 条链路</span>
                        </>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-app-border text-[10px] text-app-faint shrink-0 bg-app-raised">
        {sessions.length} 个会话
      </div>
    </aside>
  );
}
