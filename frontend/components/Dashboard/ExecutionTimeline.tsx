'use client';

import { motion } from 'framer-motion';
import { Route, ListChecks, Users, Merge, CheckCircle2, Clock } from 'lucide-react';

const timelineData = [
  { step: 'Router', icon: Route, desc: '需求分析与路由决策', time: '0.2s', status: 'done' },
  { step: 'Planner', icon: ListChecks, desc: '生成任务执行计划', time: '0.5s', status: 'done' },
  { step: 'SubAgent', icon: Users, desc: '战斗策划Agent执行中', time: '3.2s', status: 'active' },
  { step: 'Integrator', icon: Merge, desc: '整合各Agent输出结果', time: '-', status: 'pending' },
];

export default function ExecutionTimeline() {
  return (
    <div className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
      <h3 className="mb-5 text-sm font-medium text-ink/50">最近执行流程</h3>
      <div className="space-y-0">
        {timelineData.map((item, index) => {
          const Icon = item.icon;
          const isDone = item.status === 'done';
          const isActive = item.status === 'active';

          return (
            <motion.div
              key={item.step}
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
                {index < timelineData.length - 1 && (
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
                    {item.step}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-ink/30">
                    <Clock size={11} />
                    {item.time}
                  </div>
                </div>
                <p
                  className={`mt-0.5 text-xs ${
                    isActive ? 'text-ink/60' : isDone ? 'text-ink/40' : 'text-ink/25'
                  }`}
                >
                  {item.desc}
                </p>
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
