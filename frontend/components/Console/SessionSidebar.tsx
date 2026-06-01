'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, MessageSquare, Clock, Zap, Trash2, Plus } from 'lucide-react';
import { listSessions, deleteSession, type SessionMeta } from '@/lib/api';

interface Props {
  selectedId: string | null;
  onSelect: (s: SessionMeta) => void;
  onNew: () => void;
  refreshTick: number;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export default function SessionSidebar({ selectedId, onSelect, onNew, refreshTick }: Props) {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    listSessions(50)
      .then((res) => setSessions(res.sessions))
      .finally(() => setLoading(false));
  }, [refreshTick]);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(sessionId);
    try {
      await deleteSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search) return sessions;
    const needle = search.toLowerCase();
    return sessions.filter((s) =>
      s.requirement.toLowerCase().includes(needle) ||
      s.id.toLowerCase().includes(needle)
    );
  }, [search, sessions]);

  return (
    <aside className="h-full flex flex-col bg-white border-r border-ink/8 shadow-sm w-72 shrink-0">
      {/* Header */}
      <div className="px-3 py-3 border-b border-ink/8 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={14} className="text-coral" />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-ink/50">
            会话列表
          </span>
          <span className="ml-auto text-[10px] text-ink/30">{sessions.length} 个</span>
        </div>
        <div className="relative mb-2">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索会话…"
            className="w-full bg-paper/50 border border-ink/8 rounded-lg pl-7 pr-2 py-1.5 text-[12px] text-ink placeholder:text-ink/25 focus:outline-none focus:border-coral/40 focus:ring-1 focus:ring-coral/10 transition-all"
          />
        </div>
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-coral/10 text-coral py-1.5 text-[11px] font-medium hover:bg-coral/20 transition-colors"
        >
          <Plus size={12} />
          新建对话
        </button>
      </div>

      {/* List */}
      <nav ref={scrollRef} className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-6 text-center text-[12px] text-ink/40 animate-pulse">
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-ink/40">
            {search ? '无匹配会话' : '暂无会话'}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all duration-150 group/item ${
                    active
                      ? 'border-coral/30 bg-coral/5 shadow-sm'
                      : 'border-transparent hover:bg-paper/50 text-ink/60 hover:text-ink'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <div className="text-[12px] leading-tight truncate flex-1 font-medium">
                      {s.requirement.slice(0, 36)}
                      {s.requirement.length > 36 ? '…' : ''}
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleDelete(e, s.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(e as any, s.id); }}
                      className="shrink-0 opacity-0 group-hover/item:opacity-100 text-ink/20 hover:text-coral transition-all cursor-pointer"
                      title="删除会话"
                    >
                      {deleting === s.id ? (
                        <span className="text-[10px]">…</span>
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-ink/30 mt-1">
                    <Clock size={10} />
                    <span>{formatTime(s.updatedAt)}</span>
                    <span className={`px-1.5 py-0 rounded-full text-[9px] font-medium ${
                      s.status === 'completed' ? 'bg-emerald-100 text-emerald-600' :
                      s.status === 'failed' ? 'bg-red-100 text-red-600' :
                      s.status === 'running' ? 'bg-amber-100 text-amber-600' :
                      'bg-ink/5 text-ink/40'
                    }`}>
                      {s.status === 'completed' ? '完成' :
                       s.status === 'failed' ? '失败' :
                       s.status === 'running' ? '运行中' :
                       s.status === 'waiting_hitl' ? '等待审阅' : '澄清中'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </nav>
    </aside>
  );
}
