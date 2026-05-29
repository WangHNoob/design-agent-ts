'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, Trash2, Clock, CheckCircle2, AlertCircle, PauseCircle } from 'lucide-react';
import { listSessions, deleteSession, type SessionMeta } from '@/lib/api';

interface Props {
  currentSessionId?: string;
  onSelectSession?: (session: SessionMeta) => void;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: 'text-success', label: '已完成' },
  failed: { icon: AlertCircle, color: 'text-coral', label: '失败' },
  running: { icon: Clock, color: 'text-indigo', label: '进行中' },
  waiting_hitl: { icon: PauseCircle, color: 'text-warning', label: '等待审阅' },
  clarifying: { icon: Clock, color: 'text-indigo', label: '澄清中' },
};

export default function SessionSidebar({ currentSessionId, onSelectSession }: Props) {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);

  useEffect(() => {
    if (open) loadSessions();
  }, [open]);

  const loadSessions = async () => {
    try {
      const res = await listSessions(30);
      setSessions(res.sessions);
    } catch {
      // ignore
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteSession(id);
    loadSessions();
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-24 z-40 flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-ink/8 shadow-warm text-ink/40 hover:text-coral transition-colors"
        title="会话历史"
      >
        <History size={18} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-ink/10 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed left-0 top-0 z-50 h-full w-80 bg-white border-r border-ink/8 shadow-warm-lg"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-ink/5">
                <h2 className="font-display text-base font-bold text-ink">会话历史</h2>
                <button
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-ink/5 text-ink/40 hover:text-ink transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto h-[calc(100%-60px)] p-3">
                {sessions.length === 0 ? (
                  <div className="text-center py-10 text-sm text-ink/30">
                    暂无历史会话
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => {
                      const status = statusConfig[session.status] ?? statusConfig.running;
                      const StatusIcon = status.icon;
                      const isActive = session.id === currentSessionId;

                      return (
                        <motion.button
                          key={session.id}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => {
                            onSelectSession?.(session);
                            setOpen(false);
                          }}
                          className={`w-full text-left rounded-xl border p-3 transition-all ${
                            isActive
                              ? 'border-coral/30 bg-coral/5'
                              : 'border-ink/6 bg-white hover:border-ink/12 hover:bg-paper/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-ink truncate">
                                {session.requirement.slice(0, 40)}
                                {session.requirement.length > 40 ? '...' : ''}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`flex items-center gap-1 text-[11px] ${status.color}`}>
                                  <StatusIcon size={11} />
                                  {status.label}
                                </span>
                                <span className="text-[11px] text-ink/30">
                                  {formatTime(session.updatedAt)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDelete(e, session.id)}
                              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-ink/20 hover:text-coral hover:bg-coral/10 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
