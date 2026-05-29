'use client';

import { motion } from 'framer-motion';
import { Route, ListChecks, Users, Merge, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import type { SessionMeta } from '@/lib/api';

interface Props {
  sessions: SessionMeta[];
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: typeof CheckCircle2 }> = {
  running: { label: '执行中', color: 'text-coral', bg: 'bg-coral/10', icon: Users },
  completed: { label: '已完成', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
  failed: { label: '失败', color: 'text-coral', bg: 'bg-coral/10', icon: AlertCircle },
  waiting_hitl: { label: '等待审阅', color: 'text-warning', bg: 'bg-warning/10', icon: Clock },
  clarifying: { label: '澄清中', color: 'text-indigo', bg: 'bg-indigo/10', icon: ListChecks },
};

export default function ExecutionTimeline({ sessions }: Props) {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
      <h3 className="mb-5 text-sm font-medium text-ink/50">最近执行流程</h3>
      <div className="space-y-0">
        {sessions.map((session, index) => {
          const config = statusConfig[session.status] || statusConfig.running;
          const Icon = config.icon;
          const isDone = session.status === 'completed';
          const isActive = session.status === 'running';

          return (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15 }}
              className="flex gap-4"
            >
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-colors ${
                    isDone
                      ? 'border-success bg-success/10 text-success'
                      : isActive
                      ? 'border-coral bg-coral/10 text-coral'
                      : 'border-ink/10 bg-ink/5 text-ink/30'
                  }`}
                >
                  {isDone ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                </div>
                {index < sessions.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 min-h-[32px] ${
                      isDone ? 'bg-success/30' : 'bg-ink/8'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-5">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm font-semibold ${
                      isActive ? 'text-coral' : isDone ? 'text-ink' : 'text-ink/30'
                    }`}
                  >
                    {session.role}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-ink/30">
                    <Clock size={11} />
                    {new Date(session.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <p
                  className={`mt-0.5 text-xs truncate max-w-[300px] ${
                    isActive ? 'text-ink/60' : isDone ? 'text-ink/40' : 'text-ink/25'
                  }`}
                >
                  {session.requirement}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                  <span className="text-[10px] text-ink/25">{session.mode}</span>
                </div>
                {isActive && (
                  <motion.div
                    className="mt-2 h-1 w-full rounded-full bg-ink/5 overflow-hidden"
                  >
                    <motion.div
                      className="h-full rounded-full bg-coral"
                      animate={{ width: ['0%', '70%', '40%', '90%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
