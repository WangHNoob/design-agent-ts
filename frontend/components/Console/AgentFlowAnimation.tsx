'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Route, ListChecks, Users, Merge } from 'lucide-react';

const steps = [
  { label: 'Router', icon: Route, desc: '路由决策' },
  { label: 'Planner', icon: ListChecks, desc: '任务规划' },
  { label: 'SubAgent', icon: Users, desc: '子Agent执行' },
  { label: 'Integrator', icon: Merge, desc: '结果整合' },
];

export default function AgentFlowAnimation() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: false, margin: '-50px' });

  return (
    <div ref={ref} className="rounded-2xl border border-ink/8 bg-white p-6 shadow-warm">
      <h3 className="mb-6 text-sm font-medium text-ink/50">Agent 执行流程</h3>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex flex-1 items-center">
              <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={{ delay: index * 0.3, duration: 0.4 }}
              >
                <motion.div
                  className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-warm border-2 border-ink/8"
                  animate={isInView ? {
                    borderColor: ['rgba(26,26,46,0.08)', 'rgba(232,93,76,0.5)', 'rgba(26,26,46,0.08)'],
                    boxShadow: [
                      '0 0 0 rgba(232,93,76,0)',
                      '0 0 20px rgba(232,93,76,0.2)',
                      '0 0 0 rgba(232,93,76,0)',
                    ],
                  } : {
                    borderColor: 'rgba(26,26,46,0.08)',
                    boxShadow: '0 0 0 rgba(232,93,76,0)',
                  }}
                  transition={{
                    duration: 2,
                    repeat: isInView ? Infinity : 0,
                    delay: index * 0.5,
                    ease: 'easeInOut',
                  }}
                >
                  <Icon size={22} className="text-ink/60" />
                  <motion.div
                    className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-coral"
                    animate={isInView ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                    transition={{ duration: 1.5, repeat: isInView ? Infinity : 0, delay: index * 0.5 }}
                  />
                </motion.div>
                <span className="mt-2 text-xs font-semibold text-ink">{step.label}</span>
                <span className="text-[10px] text-ink/40">{step.desc}</span>
              </motion.div>

              {index < steps.length - 1 && (
                <motion.div
                  className="mx-2 h-0.5 flex-1 bg-ink/8"
                  initial={{ scaleX: 0 }}
                  animate={isInView ? { scaleX: 1 } : { scaleX: 0 }}
                  transition={{ delay: index * 0.3 + 0.2, duration: 0.5 }}
                  style={{ originX: 0 }}
                >
                  <motion.div
                    className="h-full w-1/3 bg-coral/60"
                    animate={isInView ? { x: ['0%', '200%'] } : { x: '0%' }}
                    transition={{
                      duration: 1.5,
                      repeat: isInView ? Infinity : 0,
                      delay: index * 0.5,
                      ease: 'linear',
                    }}
                  />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
