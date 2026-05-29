'use client';

import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';

const logs = [
  { time: '10:23:14', level: 'info', message: 'DirectorAgent initialized with 5 hooks' },
  { time: '10:23:15', level: 'info', message: 'Received request: mode=design, role=combat_designer' },
  { time: '10:23:15', level: 'info', message: 'Router classified intent as: combat_system_design' },
  { time: '10:23:16', level: 'info', message: 'TaskPlanner generated 4 sub-tasks' },
  { time: '10:23:16', level: 'info', message: 'Spawning CombatDesigner agent for task #1' },
  { time: '10:23:18', level: 'info', message: 'CombatDesigner completed task #1 in 2.1s' },
  { time: '10:23:19', level: 'info', message: 'Spawning NumericalPlanner agent for task #2' },
  { time: '10:23:22', level: 'warn', message: 'NumericalPlanner requested revision (iteration 1/3)' },
  { time: '10:23:24', level: 'info', message: 'NumericalPlanner completed task #2 in 5.2s' },
  { time: '10:23:25', level: 'info', message: 'Integrator merging results from 4 agents' },
  { time: '10:23:26', level: 'info', message: 'Response delivered. Total time: 11.8s' },
];

const levelColors: Record<string, string> = {
  info: 'text-emerald-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

export default function LogStream() {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
      <div className="mb-4 flex items-center gap-2">
        <Terminal size={16} className="text-ink/40" />
        <h3 className="text-sm font-medium text-ink/50">系统日志</h3>
      </div>
      <div className="rounded-xl bg-ink p-4 font-mono text-xs leading-relaxed overflow-x-auto">
        <div className="space-y-1.5">
          {logs.map((log, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex gap-3 whitespace-nowrap"
            >
              <span className="shrink-0 text-ink/30">[{log.time}]</span>
              <span className={`shrink-0 w-12 ${levelColors[log.level] || 'text-ink/50'}`}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-ink/70">{log.message}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
